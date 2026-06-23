import { Hono } from 'hono'
import type { Env, Variables } from '../types'
import { requireSuperAdmin } from '../middleware/admin'

async function ensureTable(db: Env['DB']) {
  await db.prepare(
    'CREATE TABLE IF NOT EXISTS site_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (datetime(\'now\')))'
  ).run()
}

const route = new Hono<{ Bindings: Env; Variables: Variables }>()

// GET /api/site-settings — 공개 (홈 화면에서 사용)
route.get('/', async (c) => {
  await ensureTable(c.env.DB)

  const rows = await c.env.DB.prepare(
    'SELECT key, value FROM site_settings'
  ).all<{ key: string; value: string }>()

  const settings: Record<string, string> = { join_conditions: '', join_method: '', hero_enabled: '0' }
  for (const row of rows.results) {
    settings[row.key] = row.value
  }

  return c.json(settings)
})

// PUT /api/site-settings — 최상위 관리자 전용
route.put('/', requireSuperAdmin, async (c) => {
  await ensureTable(c.env.DB)

  const body = await c.req.json<Record<string, string>>()
  const allowed = ['join_conditions', 'join_method', 'hero_enabled']

  const updates = Object.entries(body).filter(([k]) => allowed.includes(k))
  if (updates.length === 0) {
    return c.json({ error: '수정할 항목이 없습니다' }, 400)
  }

  for (const [key, value] of updates) {
    await c.env.DB.prepare(
      'INSERT INTO site_settings (key, value, updated_at) VALUES (?, ?, datetime(\'now\')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at'
    ).bind(key, String(value)).run()
  }

  return c.json({ success: true })
})

export default route
