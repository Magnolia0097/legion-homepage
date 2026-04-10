import { Hono } from 'hono'
import type { Env, Variables } from '../types'
import { requireAdmin } from '../middleware/admin'
import { verifyFirebaseToken } from '../auth'

const invite = new Hono<{ Bindings: Env; Variables: Variables }>()

function isSuperAdmin(email: string, env: Env): boolean {
  return env.SUPER_ADMIN_EMAILS.split(',').map((e) => e.trim().toLowerCase()).includes(email.toLowerCase())
}

function isExpired(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return false
  return new Date(expiresAt) < new Date()
}

// 초대 토큰 생성 (관리자 이상 - admin 타입은 최고관리자만)
invite.post('/', requireAdmin, async (c) => {
  const body = await c.req.json<{ type?: string; mode?: string; expires_in?: number }>()
  const type = body.type
  const mode = body.mode ?? 'single'

  if (type !== 'user' && type !== 'admin') {
    return c.json({ error: 'type은 user 또는 admin이어야 합니다' }, 400)
  }
  if (mode !== 'single' && mode !== 'period') {
    return c.json({ error: 'mode는 single 또는 period이어야 합니다' }, 400)
  }
  if (mode === 'period' && (!body.expires_in || body.expires_in <= 0)) {
    return c.json({ error: '기간제 링크는 유효 기간을 설정해야 합니다' }, 400)
  }

  const creatorEmail = c.get('adminEmail')

  if (type === 'admin' && !isSuperAdmin(creatorEmail, c.env)) {
    return c.json({ error: '관리자 초대 링크는 최상위 관리자만 생성할 수 있습니다' }, 403)
  }

  const token = crypto.randomUUID().replace(/-/g, '')

  let expiresAt: string | null = null
  if (mode === 'period' && body.expires_in && body.expires_in > 0) {
    const exp = new Date()
    exp.setHours(exp.getHours() + body.expires_in)
    expiresAt = exp.toISOString()
  }

  await c.env.DB.prepare(
    'INSERT INTO invite_tokens (token, type, mode, created_by, expires_at) VALUES (?, ?, ?, ?, ?)'
  ).bind(token, type, mode, creatorEmail, expiresAt).run()

  return c.json({ token }, 201)
})

// 초대 토큰 목록 (관리자 - 일반관리자는 본인 것만)
invite.get('/list', requireAdmin, async (c) => {
  const creatorEmail = c.get('adminEmail')
  const superAdmin = isSuperAdmin(creatorEmail, c.env)

  const { results } = superAdmin
    ? await c.env.DB.prepare(
        'SELECT * FROM invite_tokens ORDER BY created_at DESC'
      ).all()
    : await c.env.DB.prepare(
        'SELECT * FROM invite_tokens WHERE LOWER(created_by) = LOWER(?) ORDER BY created_at DESC'
      ).bind(creatorEmail).all()

  return c.json(results)
})

// 최초 로그인 기록 (최고관리자 전용)
invite.get('/login-logs', requireAdmin, async (c) => {
  const creatorEmail = c.get('adminEmail')
  if (!isSuperAdmin(creatorEmail, c.env)) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  const { results } = await c.env.DB.prepare(
    `SELECT id, email, nickname, added_by, invite_token, first_login_at, created_at
     FROM users
     WHERE first_login_at IS NOT NULL
     ORDER BY first_login_at DESC`
  ).all()

  return c.json(results)
})

// 초대 토큰 삭제 (1회용 미사용 + 기간제만 삭제 가능, 일반관리자는 본인 것만)
invite.delete('/:token', requireAdmin, async (c) => {
  const token = c.req.param('token')
  const creatorEmail = c.get('adminEmail')
  const superAdmin = isSuperAdmin(creatorEmail, c.env)

  const row = await c.env.DB.prepare(
    'SELECT id, created_by, used_by, mode FROM invite_tokens WHERE token = ?'
  ).bind(token).first<{ id: number; created_by: string; used_by: string | null; mode: string }>()

  if (!row) return c.json({ error: 'Not found' }, 404)
  if (row.mode === 'single' && row.used_by) return c.json({ error: '이미 사용된 링크는 삭제할 수 없습니다' }, 400)
  if (!superAdmin && row.created_by.toLowerCase() !== creatorEmail.toLowerCase()) {
    return c.json({ error: '본인이 생성한 초대 링크만 삭제할 수 있습니다' }, 403)
  }

  await c.env.DB.prepare('DELETE FROM invite_tokens WHERE token = ?').bind(token).run()
  return c.json({ success: true })
})

// 토큰 정보 조회 (공개 - 가입 전 유효성 확인)
invite.get('/:token', async (c) => {
  const token = c.req.param('token')
  const row = await c.env.DB.prepare(
    'SELECT type, mode, used_by, expires_at FROM invite_tokens WHERE token = ?'
  ).bind(token).first<{ type: string; mode: string; used_by: string | null; expires_at: string | null }>()

  if (!row) return c.json({ valid: false, error: '존재하지 않는 초대 링크입니다' }, 404)
  if (row.mode === 'single' && row.used_by) return c.json({ valid: false, error: '이미 사용된 초대 링크입니다' })
  if (isExpired(row.expires_at)) return c.json({ valid: false, error: '만료된 초대 링크입니다' })
  return c.json({ valid: true, type: row.type, mode: row.mode })
})

// 토큰 사용 - 신규 사용자/관리자 가입
invite.post('/:token/use', async (c) => {
  const token = c.req.param('token')

  const authHeader = c.req.header('Authorization')
  const firebaseToken = authHeader?.replace('Bearer ', '')
  if (!firebaseToken) return c.json({ error: 'Unauthorized' }, 401)

  const verified = await verifyFirebaseToken(firebaseToken, c.env.FIREBASE_PROJECT_ID)
  if (!verified) return c.json({ error: 'Invalid token' }, 401)

  const email = verified.email.toLowerCase()
  const body = await c.req.json<{ nickname?: string }>()
  const nickname = body.nickname?.trim()
  if (!nickname) return c.json({ error: 'nickname은 필수입니다' }, 400)

  // 최고관리자는 가입 불가
  if (isSuperAdmin(email, c.env)) {
    return c.json({ error: '최고 관리자는 초대 링크로 가입할 수 없습니다' }, 400)
  }

  // 이미 등록된 경우 차단
  const existingAdmin = await c.env.DB.prepare(
    'SELECT id FROM admins WHERE LOWER(email) = ?'
  ).bind(email).first()
  if (existingAdmin) return c.json({ error: '이미 관리자로 등록된 이메일입니다' }, 409)

  const existingUser = await c.env.DB.prepare(
    'SELECT id FROM users WHERE LOWER(email) = ?'
  ).bind(email).first()
  if (existingUser) return c.json({ error: '이미 가입된 이메일입니다' }, 409)

  // 토큰 유효성 확인
  const inviteRow = await c.env.DB.prepare(
    'SELECT id, type, mode, created_by, used_by, expires_at FROM invite_tokens WHERE token = ?'
  ).bind(token).first<{ id: number; type: string; mode: string; created_by: string; used_by: string | null; expires_at: string | null }>()

  if (!inviteRow) return c.json({ error: '존재하지 않는 초대 링크입니다' }, 404)
  if (inviteRow.mode === 'single' && inviteRow.used_by) return c.json({ error: '이미 사용된 초대 링크입니다' }, 400)
  if (isExpired(inviteRow.expires_at)) return c.json({ error: '만료된 초대 링크입니다' }, 400)

  const now = new Date().toISOString()

  if (inviteRow.type === 'user') {
    await c.env.DB.prepare(
      'INSERT INTO users (email, nickname, added_by, first_login_at, invite_token) VALUES (?, ?, ?, ?, ?)'
    ).bind(email, nickname, inviteRow.created_by, now, token).run()
  } else {
    await c.env.DB.prepare(
      'INSERT INTO admins (email, added_by, permissions) VALUES (?, ?, ?)'
    ).bind(email, inviteRow.created_by, JSON.stringify(['notice', 'gallery', 'event', 'member'])).run()
    await c.env.DB.prepare(
      'INSERT OR REPLACE INTO admin_nicknames (email, nickname) VALUES (?, ?)'
    ).bind(email, nickname).run()
  }

  // 1회용만 소모 처리
  if (inviteRow.mode === 'single') {
    await c.env.DB.prepare(
      'UPDATE invite_tokens SET used_by = ?, used_at = ? WHERE token = ?'
    ).bind(email, now, token).run()
  }

  return c.json({ success: true, type: inviteRow.type })
})

export default invite
