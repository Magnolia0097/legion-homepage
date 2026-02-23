import { Hono } from 'hono'
import type { Env } from '../types'

const notices = new Hono<{ Bindings: Env }>()

// 공지 전체 목록 (고정글 우선, 최신순)
notices.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM notices ORDER BY is_pinned DESC, created_at DESC'
  ).all()
  return c.json(results)
})

// 공지 단건 상세
notices.get('/:id', async (c) => {
  const id = c.req.param('id')
  const notice = await c.env.DB.prepare(
    'SELECT * FROM notices WHERE id = ?'
  ).bind(id).first()
  if (!notice) return c.json({ error: 'Not found' }, 404)
  return c.json(notice)
})

// 공지 작성 (관리자 전용 - 미들웨어에서 검증됨)
notices.post('/', async (c) => {
  const { title, content, author, is_pinned } = await c.req.json<{
    title: string
    content: string
    author: string
    is_pinned?: number
  }>()

  if (!title || !content || !author) {
    return c.json({ error: 'title, content, author는 필수입니다' }, 400)
  }

  const result = await c.env.DB.prepare(
    'INSERT INTO notices (title, content, author, is_pinned) VALUES (?, ?, ?, ?)'
  ).bind(title, content, author, is_pinned ?? 0).run()

  return c.json({ id: result.meta.last_row_id }, 201)
})

// 공지 수정 (관리자 전용)
notices.put('/:id', async (c) => {
  const id = c.req.param('id')
  const { title, content, is_pinned } = await c.req.json<{
    title: string
    content: string
    is_pinned?: number
  }>()

  const existing = await c.env.DB.prepare(
    'SELECT id FROM notices WHERE id = ?'
  ).bind(id).first()
  if (!existing) return c.json({ error: 'Not found' }, 404)

  await c.env.DB.prepare(
    'UPDATE notices SET title = ?, content = ?, is_pinned = ?, updated_at = datetime("now") WHERE id = ?'
  ).bind(title, content, is_pinned ?? 0, id).run()

  return c.json({ success: true })
})

// 공지 삭제 (관리자 전용)
notices.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const existing = await c.env.DB.prepare(
    'SELECT id FROM notices WHERE id = ?'
  ).bind(id).first()
  if (!existing) return c.json({ error: 'Not found' }, 404)

  await c.env.DB.prepare('DELETE FROM notices WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

export default notices
