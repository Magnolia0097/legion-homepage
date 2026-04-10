import type { Context, Next } from 'hono'
import type { Env, Variables } from '../types'
import { verifyFirebaseToken } from '../auth'

// 일반 사용자(users 테이블) 또는 관리자(admins + super)를 허용하는 미들웨어
// 댓글 작성 등 로그인된 사용자 전용 기능에 사용
export async function requireLoggedInUser(
  c: Context<{ Bindings: Env; Variables: Variables }>,
  next: Next
) {
  const token = c.req.header('Authorization')?.replace('Bearer ', '')
  if (!token) return c.json({ error: 'Unauthorized' }, 401)

  const result = await verifyFirebaseToken(token, c.env.FIREBASE_PROJECT_ID)
  if (!result) return c.json({ error: 'Invalid token' }, 401)

  const email = result.email.toLowerCase()

  // 최고 관리자 체크
  const superAdmins = c.env.SUPER_ADMIN_EMAILS.split(',').map((e) => e.trim().toLowerCase())
  if (superAdmins.includes(email)) {
    const nicknameRow = await c.env.DB.prepare(
      'SELECT nickname FROM admin_nicknames WHERE LOWER(email) = ?'
    ).bind(email).first<{ nickname: string }>()
    c.set('userEmail', email)
    c.set('userNickname', nicknameRow?.nickname?.trim() || '관리자')
    await next()
    return
  }

  // 일반 관리자 체크
  const adminRow = await c.env.DB.prepare(
    'SELECT id FROM admins WHERE LOWER(email) = ?'
  ).bind(email).first<{ id: number }>()
  if (adminRow) {
    const nicknameRow = await c.env.DB.prepare(
      'SELECT nickname FROM admin_nicknames WHERE LOWER(email) = ?'
    ).bind(email).first<{ nickname: string }>()
    c.set('userEmail', email)
    c.set('userNickname', nicknameRow?.nickname?.trim() || '관리자')
    await next()
    return
  }

  // 일반 사용자 체크
  const userRow = await c.env.DB.prepare(
    'SELECT id, nickname FROM users WHERE LOWER(email) = ?'
  ).bind(email).first<{ id: number; nickname: string }>()
  if (userRow) {
    c.set('userEmail', email)
    c.set('userNickname', userRow.nickname)
    await next()
    return
  }

  return c.json({ error: 'Forbidden: 등록된 사용자가 아닙니다' }, 403)
}
