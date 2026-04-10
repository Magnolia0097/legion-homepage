import { Hono } from 'hono'
import type { Env, Variables } from '../types'
import { requireSuperAdmin } from '../middleware/admin'
import { verifyFirebaseToken } from '../auth'
import { writeLog } from '../lib/logger'

const adminAccounts = new Hono<{ Bindings: Env; Variables: Variables }>()

// 관리자 목록 조회 (최상위 관리자 전용) - nickname JOIN 포함
adminAccounts.get('/', requireSuperAdmin, async (c) => {
  const { results } = await c.env.DB.prepare(`
    SELECT a.id, a.email, a.added_by, a.created_at, a.permissions,
           COALESCE(n.nickname, '') AS nickname
    FROM admins a
    LEFT JOIN admin_nicknames n ON a.email = n.email
    ORDER BY a.created_at ASC
  `).all()
  return c.json(results)
})

// 관리자 추가 (최상위 관리자 전용)
adminAccounts.post('/', requireSuperAdmin, async (c) => {
  const { email } = await c.req.json<{ email: string }>()
  if (!email) return c.json({ error: 'email은 필수입니다' }, 400)

  const normalizedEmail = email.toLowerCase().trim()

  // 최상위 관리자를 일반 관리자로 추가 불가
  const superAdmins = c.env.SUPER_ADMIN_EMAILS.split(',').map((e) => e.trim().toLowerCase())
  if (superAdmins.includes(normalizedEmail)) {
    return c.json({ error: '최상위 관리자는 일반 관리자로 추가할 수 없습니다' }, 400)
  }

  // 요청자 이메일 추출
  const token = c.req.header('Authorization')?.replace('Bearer ', '')
  const requester = token ? await verifyFirebaseToken(token, c.env.FIREBASE_PROJECT_ID) : null

  try {
    const result = await c.env.DB.prepare(
      'INSERT INTO admins (email, added_by) VALUES (?, ?)'
    ).bind(normalizedEmail, requester?.email ?? 'super_admin').run()

    await writeLog({
      db: c.env.DB, adminEmail: c.get('adminEmail'),
      action: 'create', targetType: 'admin_account',
      targetId: result.meta.last_row_id as number, detail: normalizedEmail,
    })

    return c.json({ success: true }, 201)
  } catch {
    return c.json({ error: '이미 등록된 이메일입니다' }, 409)
  }
})

// 관리자 닉네임 수정 (최상위 관리자 전용 - 타 관리자 닉네임 설정)
adminAccounts.patch('/:id/nickname', requireSuperAdmin, async (c) => {
  const id = c.req.param('id')
  const { nickname } = await c.req.json<{ nickname: string }>()
  if (typeof nickname !== 'string') {
    return c.json({ error: 'nickname은 문자열이어야 합니다' }, 400)
  }

  const existing = await c.env.DB.prepare(
    'SELECT id, email FROM admins WHERE id = ?'
  ).bind(id).first<{ id: number; email: string }>()
  if (!existing) return c.json({ error: 'Not found' }, 404)

  await c.env.DB.prepare(
    'INSERT OR REPLACE INTO admin_nicknames (email, nickname) VALUES (?, ?)'
  ).bind(existing.email, nickname.trim()).run()

  await writeLog({
    db: c.env.DB, adminEmail: c.get('adminEmail'),
    action: 'patch', targetType: 'admin_account',
    targetId: Number(id), detail: `${existing.email} 닉네임: ${nickname.trim() || '(없음)'}`,
  })

  return c.json({ success: true, nickname: nickname.trim() })
})

// 관리자 권한 수정 (최상위 관리자 전용)
adminAccounts.patch('/:id/permissions', requireSuperAdmin, async (c) => {
  const id = c.req.param('id')
  const { permissions } = await c.req.json<{ permissions: string[] }>()
  if (!Array.isArray(permissions)) {
    return c.json({ error: 'permissions는 배열이어야 합니다' }, 400)
  }

  const VALID = ['notice', 'gallery', 'event', 'member']
  const filtered = permissions.filter((p) => VALID.includes(p))

  const existing = await c.env.DB.prepare(
    'SELECT id, email FROM admins WHERE id = ?'
  ).bind(id).first<{ id: number; email: string }>()
  if (!existing) return c.json({ error: 'Not found' }, 404)

  await c.env.DB.prepare(
    'UPDATE admins SET permissions = ? WHERE id = ?'
  ).bind(JSON.stringify(filtered), id).run()

  await writeLog({
    db: c.env.DB, adminEmail: c.get('adminEmail'),
    action: 'patch', targetType: 'admin_account',
    targetId: Number(id), detail: `${existing.email} 권한: ${filtered.join(', ') || '없음'}`,
  })

  return c.json({ success: true, permissions: filtered })
})

// 관리자 삭제 (최상위 관리자 전용)
adminAccounts.delete('/:id', requireSuperAdmin, async (c) => {
  const id = c.req.param('id')
  const existing = await c.env.DB.prepare(
    'SELECT id, email FROM admins WHERE id = ?'
  ).bind(id).first<{ id: number; email: string }>()
  if (!existing) return c.json({ error: 'Not found' }, 404)

  await c.env.DB.prepare('DELETE FROM admins WHERE id = ?').bind(id).run()

  await writeLog({
    db: c.env.DB, adminEmail: c.get('adminEmail'),
    action: 'delete', targetType: 'admin_account',
    targetId: Number(id), detail: existing.email,
  })

  return c.json({ success: true })
})

export default adminAccounts
