import { Hono } from 'hono'
import type { Env } from '../types'
import { requireAdmin } from '../middleware/admin'

const members = new Hono<{ Bindings: Env }>()

// 활동중인 멤버 목록
members.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM members WHERE is_active = 1 ORDER BY role ASC, nickname ASC'
  ).all()
  return c.json(results)
})

// 멤버 추가 (관리자 전용)
members.post('/', requireAdmin, async (c) => {
  const { nickname, role, joined_at } = await c.req.json<{
    nickname: string
    role: string
    joined_at?: string
  }>()
  if (!nickname || !role) {
    return c.json({ error: 'nickname, role은 필수입니다' }, 400)
  }
  const result = await c.env.DB.prepare(
    'INSERT INTO members (nickname, role, joined_at, is_active) VALUES (?, ?, ?, 1)'
  ).bind(nickname, role, joined_at ?? null).run()
  return c.json({ id: result.meta.last_row_id }, 201)
})

// 멤버 수정 (관리자 전용)
members.put('/:id', requireAdmin, async (c) => {
  const id = c.req.param('id')
  const { nickname, role, joined_at } = await c.req.json<{
    nickname: string
    role: string
    joined_at?: string
  }>()
  const existing = await c.env.DB.prepare(
    'SELECT id FROM members WHERE id = ?'
  ).bind(id).first()
  if (!existing) return c.json({ error: 'Not found' }, 404)

  await c.env.DB.prepare(
    'UPDATE members SET nickname = ?, role = ?, joined_at = ? WHERE id = ?'
  ).bind(nickname, role, joined_at ?? null, id).run()
  return c.json({ success: true })
})

// 멤버 삭제 (관리자 전용 - is_active = 0으로 소프트 삭제)
members.delete('/:id', requireAdmin, async (c) => {
  const id = c.req.param('id')
  const existing = await c.env.DB.prepare(
    'SELECT id FROM members WHERE id = ?'
  ).bind(id).first()
  if (!existing) return c.json({ error: 'Not found' }, 404)

  await c.env.DB.prepare(
    'UPDATE members SET is_active = 0 WHERE id = ?'
  ).bind(id).run()
  return c.json({ success: true })
})

export default members
