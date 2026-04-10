import { Hono } from 'hono'
import type { Env, Variables, User } from '../types'
import { requireSuperAdmin } from '../middleware/admin'
import { verifyFirebaseToken } from '../auth'
import { writeLog } from '../lib/logger'
import { sendWelcomeEmail } from '../lib/email'

const users = new Hono<{ Bindings: Env; Variables: Variables }>()

// 일반 사용자 목록 (최고 관리자 전용)
users.get('/', requireSuperAdmin, async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM users ORDER BY created_at DESC'
  ).all<User>()
  return c.json(results)
})

// 일반 사용자 추가 (최고 관리자 전용) + 가입 완료 메일 전송
users.post('/', requireSuperAdmin, async (c) => {
  const { email, nickname } = await c.req.json<{ email: string; nickname: string }>()
  if (!email || !nickname) {
    return c.json({ error: 'email과 nickname은 필수입니다' }, 400)
  }

  const normalizedEmail = email.toLowerCase().trim()
  const trimmedNickname = nickname.trim()

  // 최고 관리자 이메일은 일반 사용자로 등록 불가
  const superAdmins = c.env.SUPER_ADMIN_EMAILS.split(',').map((e) => e.trim().toLowerCase())
  if (superAdmins.includes(normalizedEmail)) {
    return c.json({ error: '최고 관리자는 일반 사용자로 등록할 수 없습니다' }, 400)
  }

  const token = c.req.header('Authorization')?.replace('Bearer ', '')
  const requester = token ? await verifyFirebaseToken(token, c.env.FIREBASE_PROJECT_ID) : null

  try {
    const result = await c.env.DB.prepare(
      'INSERT INTO users (email, nickname, added_by) VALUES (?, ?, ?)'
    ).bind(normalizedEmail, trimmedNickname, requester?.email ?? 'super_admin').run()

    await writeLog({
      db: c.env.DB,
      adminEmail: c.get('adminEmail'),
      action: 'create',
      targetType: 'admin_account', // 로그 타입 재사용
      targetId: result.meta.last_row_id as number,
      detail: `일반사용자 등록: ${normalizedEmail} (${trimmedNickname})`,
    })

    // 가입 완료 이메일 전송 (RESEND_API_KEY가 설정된 경우)
    if (c.env.RESEND_API_KEY) {
      const from = c.env.RESEND_FROM_EMAIL ?? 'noreply@nania-ssimdang.pages.dev'
      try {
        await sendWelcomeEmail({
          apiKey: c.env.RESEND_API_KEY,
          from,
          to: normalizedEmail,
          nickname: trimmedNickname,
        })
      } catch {
        // 이메일 전송 실패는 무시 (사용자 등록 자체는 성공 처리)
      }
    }

    return c.json({ success: true, id: result.meta.last_row_id }, 201)
  } catch {
    return c.json({ error: '이미 등록된 이메일입니다' }, 409)
  }
})

// 일반 사용자 닉네임 수정 (최고 관리자 전용)
users.patch('/:id/nickname', requireSuperAdmin, async (c) => {
  const id = c.req.param('id')
  const { nickname } = await c.req.json<{ nickname: string }>()
  if (typeof nickname !== 'string' || !nickname.trim()) {
    return c.json({ error: 'nickname은 필수 문자열입니다' }, 400)
  }

  const existing = await c.env.DB.prepare(
    'SELECT id, email FROM users WHERE id = ?'
  ).bind(id).first<{ id: number; email: string }>()
  if (!existing) return c.json({ error: 'Not found' }, 404)

  await c.env.DB.prepare(
    'UPDATE users SET nickname = ? WHERE id = ?'
  ).bind(nickname.trim(), id).run()

  return c.json({ success: true, nickname: nickname.trim() })
})

// 일반 사용자 삭제 (최고 관리자 전용)
users.delete('/:id', requireSuperAdmin, async (c) => {
  const id = c.req.param('id')
  const existing = await c.env.DB.prepare(
    'SELECT id, email FROM users WHERE id = ?'
  ).bind(id).first<{ id: number; email: string }>()
  if (!existing) return c.json({ error: 'Not found' }, 404)

  await c.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run()

  await writeLog({
    db: c.env.DB,
    adminEmail: c.get('adminEmail'),
    action: 'delete',
    targetType: 'admin_account',
    targetId: Number(id),
    detail: `일반사용자 삭제: ${existing.email}`,
  })

  return c.json({ success: true })
})

export default users
