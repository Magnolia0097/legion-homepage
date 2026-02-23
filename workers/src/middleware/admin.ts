import type { Context, Next } from 'hono'
import type { Env } from '../types'
import { verifyFirebaseToken } from '../auth'

export async function requireAdmin(c: Context<{ Bindings: Env }>, next: Next) {
  const authHeader = c.req.header('Authorization')
  const token = authHeader?.replace('Bearer ', '')
  if (!token) return c.json({ error: 'Unauthorized' }, 401)

  const result = await verifyFirebaseToken(token, c.env.FIREBASE_PROJECT_ID)
  if (!result) return c.json({ error: 'Invalid token' }, 401)

  const adminEmails = c.env.ADMIN_EMAILS.split(',').map((e) => e.trim())
  if (!adminEmails.includes(result.email)) {
    return c.json({ error: 'Forbidden: 관리자 권한이 없습니다' }, 403)
  }

  await next()
}
