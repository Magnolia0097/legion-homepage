import { Hono } from 'hono'
import type { Env, Variables } from '../types'
import { requireSuperAdmin } from '../middleware/admin'

const adminLogs = new Hono<{ Bindings: Env; Variables: Variables }>()

// 활동 로그 조회 (최상위 관리자 전용, 최신순 200개)
adminLogs.get('/', requireSuperAdmin, async (c) => {
  const limit = Number(c.req.query('limit') ?? 200)
  const offset = Number(c.req.query('offset') ?? 0)

  const { results } = await c.env.DB.prepare(
    `SELECT l.*, u.nickname AS admin_nickname
     FROM admin_logs l
     LEFT JOIN users u ON u.email = l.admin_email
     ORDER BY l.created_at DESC LIMIT ? OFFSET ?`
  ).bind(limit, offset).all()

  return c.json(results)
})

export default adminLogs
