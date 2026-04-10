import type { Context, Next } from 'hono'
import type { Env, Variables } from '../types'
import { verifyFirebaseToken } from '../auth'

// 최상위 관리자 여부 확인 (환경변수)
function isSuperAdminEmail(email: string, env: Env): boolean {
  return env.SUPER_ADMIN_EMAILS.split(',').map((e) => e.trim()).includes(email)
}

// 일반 관리자 행 조회 (permissions 포함)
async function getAdminRow(email: string, env: Env): Promise<{ id: number; permissions: string } | null> {
  return env.DB.prepare(
    'SELECT id, permissions FROM admins WHERE LOWER(email) = LOWER(?)'
  ).bind(email).first<{ id: number; permissions: string }>()
}

// 최상위 관리자 또는 일반 관리자 (모든 권한)
export async function requireAdmin(c: Context<{ Bindings: Env; Variables: Variables }>, next: Next) {
  const token = c.req.header('Authorization')?.replace('Bearer ', '')
  if (!token) return c.json({ error: 'Unauthorized' }, 401)

  const result = await verifyFirebaseToken(token, c.env.FIREBASE_PROJECT_ID)
  if (!result) return c.json({ error: 'Invalid token' }, 401)

  if (isSuperAdminEmail(result.email, c.env)) {
    c.set('adminEmail', result.email)
    await next()
    return
  }

  const row = await getAdminRow(result.email, c.env)
  if (row) {
    c.set('adminEmail', result.email)
    await next()
    return
  }

  return c.json({ error: 'Forbidden: 관리자 권한이 없습니다' }, 403)
}

// 최상위 관리자 전용
export async function requireSuperAdmin(c: Context<{ Bindings: Env; Variables: Variables }>, next: Next) {
  const token = c.req.header('Authorization')?.replace('Bearer ', '')
  if (!token) return c.json({ error: 'Unauthorized' }, 401)

  const result = await verifyFirebaseToken(token, c.env.FIREBASE_PROJECT_ID)
  if (!result) return c.json({ error: 'Invalid token' }, 401)

  if (!isSuperAdminEmail(result.email, c.env)) {
    return c.json({ error: 'Forbidden: 최상위 관리자 권한이 없습니다' }, 403)
  }
  c.set('adminEmail', result.email)
  await next()
}

// 특정 권한 보유 관리자 전용 팩토리 (최상위 관리자는 항상 허용)
export function requirePermission(permission: string) {
  return async (c: Context<{ Bindings: Env; Variables: Variables }>, next: Next) => {
    const token = c.req.header('Authorization')?.replace('Bearer ', '')
    if (!token) return c.json({ error: 'Unauthorized' }, 401)

    const result = await verifyFirebaseToken(token, c.env.FIREBASE_PROJECT_ID)
    if (!result) return c.json({ error: 'Invalid token' }, 401)

    // 최상위 관리자는 모든 권한 보유
    if (isSuperAdminEmail(result.email, c.env)) {
      c.set('adminEmail', result.email)
      await next()
      return
    }

    // 일반 관리자: 해당 권한 보유 여부 확인
    const row = await getAdminRow(result.email, c.env)
    if (row) {
      let perms: string[] = []
      try { perms = JSON.parse(row.permissions) } catch { /* invalid json */ }
      if (perms.includes(permission)) {
        c.set('adminEmail', result.email)
        await next()
        return
      }
    }

    return c.json({ error: `Forbidden: '${permission}' 권한이 없습니다` }, 403)
  }
}
