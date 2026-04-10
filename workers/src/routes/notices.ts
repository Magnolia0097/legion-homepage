import { Hono } from 'hono'
import type { Env, Variables } from '../types'
import { requirePermission } from '../middleware/admin'
import { writeLog } from '../lib/logger'

const notices = new Hono<{ Bindings: Env; Variables: Variables }>()

// 공지 전체 목록 (고정글 우선, 최신순)
notices.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM notices ORDER BY is_pinned DESC, created_at DESC'
  ).all()
  return c.json(results)
})

// 공지 단건 상세 + 조회수 증가
notices.get('/:id', async (c) => {
  const id = c.req.param('id')
  const notice = await c.env.DB.prepare(
    'SELECT * FROM notices WHERE id = ?'
  ).bind(id).first()
  if (!notice) return c.json({ error: 'Not found' }, 404)
  // 조회수 증가
  await c.env.DB.prepare(
    'UPDATE notices SET view_count = view_count + 1 WHERE id = ?'
  ).bind(id).run()
  return c.json({ ...(notice as object), view_count: ((notice as Record<string, unknown>).view_count as number ?? 0) + 1 })
})

// 공지 작성 (관리자 전용)
notices.post('/', requirePermission('notice'), async (c) => {
  const { title, content, is_pinned } = await c.req.json<{
    title: string
    content: string
    is_pinned?: number
  }>()
  if (!title || !content) {
    return c.json({ error: 'title, content는 필수입니다' }, 400)
  }
  // 작성자 닉네임 자동 조회 (없으면 '관리자')
  const adminEmail = c.get('adminEmail')
  const nicknameRow = await c.env.DB.prepare(
    'SELECT nickname FROM admin_nicknames WHERE email = ?'
  ).bind(adminEmail).first<{ nickname: string }>()
  const author = nicknameRow?.nickname?.trim() || '관리자'

  const result = await c.env.DB.prepare(
    'INSERT INTO notices (title, content, author, is_pinned) VALUES (?, ?, ?, ?)'
  ).bind(title, content, author, is_pinned ?? 0).run()

  await writeLog({
    db: c.env.DB, adminEmail: c.get('adminEmail'),
    action: 'create', targetType: 'notice',
    targetId: result.meta.last_row_id as number, detail: title,
  })

  return c.json({ id: result.meta.last_row_id }, 201)
})

// 공지 수정 (관리자 전용)
notices.put('/:id', requirePermission('notice'), async (c) => {
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

  await writeLog({
    db: c.env.DB, adminEmail: c.get('adminEmail'),
    action: 'update', targetType: 'notice',
    targetId: Number(id), detail: title,
  })

  return c.json({ success: true })
})

// 음악 업로드 (관리자 전용)
notices.post('/:id/music', requirePermission('notice'), async (c) => {
  const id = c.req.param('id')
  const existing = await c.env.DB.prepare(
    'SELECT id, music_key FROM notices WHERE id = ?'
  ).bind(id).first<{ id: number; music_key: string | null }>()
  if (!existing) return c.json({ error: 'Not found' }, 404)

  const formData = await c.req.formData()
  const file = formData.get('file') as File | null
  if (!file) return c.json({ error: 'file은 필수입니다' }, 400)

  // 기존 음악 파일 R2에서 삭제
  if (existing.music_key) {
    await c.env.BUCKET.delete(existing.music_key)
  }

  const uuid = crypto.randomUUID()
  const ext = (file.name.split('.').pop()?.toLowerCase()) || 'mp3'
  const fileKey = `notices/${id}/${uuid}.${ext}`
  await c.env.BUCKET.put(fileKey, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type || 'audio/mpeg' },
  })

  await c.env.DB.prepare(
    "UPDATE notices SET music_key = ?, updated_at = datetime('now') WHERE id = ?"
  ).bind(fileKey, id).run()

  return c.json({ success: true, fileKey }, 201)
})

// 음악 삭제 (관리자 전용)
notices.delete('/:id/music', requirePermission('notice'), async (c) => {
  const id = c.req.param('id')
  const existing = await c.env.DB.prepare(
    'SELECT id, music_key FROM notices WHERE id = ?'
  ).bind(id).first<{ id: number; music_key: string | null }>()
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (!existing.music_key) return c.json({ error: 'No music attached' }, 404)

  await c.env.BUCKET.delete(existing.music_key)
  await c.env.DB.prepare(
    "UPDATE notices SET music_key = NULL, updated_at = datetime('now') WHERE id = ?"
  ).bind(id).run()

  return c.json({ success: true })
})

// 공지 삭제 (관리자 전용)
notices.delete('/:id', requirePermission('notice'), async (c) => {
  const id = c.req.param('id')
  const existing = await c.env.DB.prepare(
    'SELECT id, title, music_key FROM notices WHERE id = ?'
  ).bind(id).first<{ id: number; title: string; music_key: string | null }>()
  if (!existing) return c.json({ error: 'Not found' }, 404)

  // 첨부 음악 R2 정리
  if (existing.music_key) {
    await c.env.BUCKET.delete(existing.music_key)
  }

  await c.env.DB.prepare('DELETE FROM notices WHERE id = ?').bind(id).run()

  await writeLog({
    db: c.env.DB, adminEmail: c.get('adminEmail'),
    action: 'delete', targetType: 'notice',
    targetId: Number(id), detail: existing.title,
  })

  return c.json({ success: true })
})

export default notices
