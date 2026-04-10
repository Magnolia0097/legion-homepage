import { Hono } from 'hono'
import type { Env, Variables } from '../types'
import { requirePermission } from '../middleware/admin'
import { writeLog } from '../lib/logger'

const events = new Hono<{ Bindings: Env; Variables: Variables }>()

// 이벤트 전체 목록 (썸네일 + photo_count + end_date + view_count 포함, 최신순)
events.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(`
    SELECT e.*,
      (SELECT file_key FROM event_photos WHERE event_id = e.id ORDER BY sort_order ASC, id ASC LIMIT 1) AS thumbnail_key,
      (SELECT COUNT(*) FROM event_photos WHERE event_id = e.id) AS photo_count
    FROM events e
    ORDER BY e.created_at DESC
  `).all()
  return c.json(results)
})

// 이벤트 단건 상세 (사진 포함) + 조회수 증가
events.get('/:id', async (c) => {
  const id = c.req.param('id')
  const event = await c.env.DB.prepare('SELECT * FROM events WHERE id = ?').bind(id).first()
  if (!event) return c.json({ error: 'Not found' }, 404)
  const { results: photos } = await c.env.DB.prepare(
    'SELECT * FROM event_photos WHERE event_id = ? ORDER BY sort_order ASC, id ASC'
  ).bind(id).all()
  // 조회수 증가
  await c.env.DB.prepare(
    'UPDATE events SET view_count = view_count + 1 WHERE id = ?'
  ).bind(id).run()
  return c.json({ ...(event as object), view_count: ((event as Record<string, unknown>).view_count as number ?? 0) + 1, photos })
})

// 이벤트 생성 (관리자 전용)
events.post('/', requirePermission('event'), async (c) => {
  const { title, content, end_date } = await c.req.json<{ title: string; content: string; end_date?: string }>()
  if (!title || !content) return c.json({ error: 'title, content는 필수입니다' }, 400)
  // 작성자 닉네임 자동 조회 (없으면 '관리자')
  const adminEmail = c.get('adminEmail')
  const nicknameRow = await c.env.DB.prepare(
    'SELECT nickname FROM admin_nicknames WHERE email = ?'
  ).bind(adminEmail).first<{ nickname: string }>()
  const author = nicknameRow?.nickname?.trim() || '관리자'

  const result = await c.env.DB.prepare(
    'INSERT INTO events (title, content, author, end_date) VALUES (?, ?, ?, ?)'
  ).bind(title, content, author, end_date ?? null).run()

  await writeLog({
    db: c.env.DB, adminEmail: c.get('adminEmail'),
    action: 'create', targetType: 'event',
    targetId: result.meta.last_row_id as number, detail: title,
  })

  return c.json({ id: result.meta.last_row_id }, 201)
})

// 이벤트 수정 (관리자 전용)
events.put('/:id', requirePermission('event'), async (c) => {
  const id = c.req.param('id')
  const { title, content, end_date } = await c.req.json<{ title: string; content: string; end_date?: string }>()
  const existing = await c.env.DB.prepare('SELECT id FROM events WHERE id = ?').bind(id).first()
  if (!existing) return c.json({ error: 'Not found' }, 404)
  await c.env.DB.prepare(
    `UPDATE events SET title = ?, content = ?, end_date = ?, updated_at = datetime('now') WHERE id = ?`
  ).bind(title, content, end_date ?? null, id).run()

  await writeLog({
    db: c.env.DB, adminEmail: c.get('adminEmail'),
    action: 'update', targetType: 'event',
    targetId: Number(id), detail: title,
  })

  return c.json({ success: true })
})

// 상태 토글: active ↔ ended (관리자 전용)
events.patch('/:id/status', requirePermission('event'), async (c) => {
  const id = c.req.param('id')
  const event = await c.env.DB.prepare('SELECT id, status, title FROM events WHERE id = ?')
    .bind(id).first<{ id: number; status: string; title: string }>()
  if (!event) return c.json({ error: 'Not found' }, 404)
  const newStatus = event.status === 'active' ? 'ended' : 'active'
  await c.env.DB.prepare(
    `UPDATE events SET status = ?, updated_at = datetime('now') WHERE id = ?`
  ).bind(newStatus, id).run()

  await writeLog({
    db: c.env.DB, adminEmail: c.get('adminEmail'),
    action: 'patch', targetType: 'event',
    targetId: Number(id), detail: `${event.title} → ${newStatus === 'active' ? '진행중' : '종료'}`,
  })

  return c.json({ status: newStatus })
})

// 사진 업로드 (관리자 전용)
events.post('/:id/photos', requirePermission('event'), async (c) => {
  const eventId = c.req.param('id')
  const existing = await c.env.DB.prepare('SELECT id FROM events WHERE id = ?').bind(eventId).first()
  if (!existing) return c.json({ error: 'Event not found' }, 404)

  const formData = await c.req.formData()
  const file = formData.get('file') as File | null
  if (!file) return c.json({ error: 'file은 필수입니다' }, 400)

  const maxRow = await c.env.DB.prepare(
    'SELECT COALESCE(MAX(sort_order), -1) AS mx FROM event_photos WHERE event_id = ?'
  ).bind(eventId).first<{ mx: number }>()
  const sortOrder = (maxRow?.mx ?? -1) + 1

  const uuid = crypto.randomUUID()
  const fileKey = `events/${eventId}/${uuid}.webp`
  await c.env.BUCKET.put(fileKey, await file.arrayBuffer(), {
    httpMetadata: { contentType: 'image/webp' },
  })

  const photoResult = await c.env.DB.prepare(
    'INSERT INTO event_photos (event_id, file_key, sort_order) VALUES (?, ?, ?)'
  ).bind(eventId, fileKey, sortOrder).run()

  await writeLog({
    db: c.env.DB, adminEmail: c.get('adminEmail'),
    action: 'create', targetType: 'event_photo',
    targetId: photoResult.meta.last_row_id as number, detail: `이벤트 ID ${eventId} 사진 업로드`,
  })

  return c.json({ success: true, fileKey }, 201)
})

// 사진 순서 변경 (관리자 전용)
events.patch('/:id/photos/reorder', requirePermission('event'), async (c) => {
  const eventId = c.req.param('id')
  const { orderedIds } = await c.req.json<{ orderedIds: number[] }>()
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    return c.json({ error: 'orderedIds는 필수입니다' }, 400)
  }
  const stmts = orderedIds.map((photoId, idx) =>
    c.env.DB.prepare('UPDATE event_photos SET sort_order = ? WHERE id = ? AND event_id = ?')
      .bind(idx, photoId, eventId)
  )
  await c.env.DB.batch(stmts)
  return c.json({ success: true })
})

// 사진 삭제 (관리자 전용)
events.delete('/:id/photos/:photoId', requirePermission('event'), async (c) => {
  const photoId = c.req.param('photoId')
  const eventId = c.req.param('id')
  const photo = await c.env.DB.prepare('SELECT file_key FROM event_photos WHERE id = ?')
    .bind(photoId).first<{ file_key: string }>()
  if (!photo) return c.json({ error: 'Not found' }, 404)
  await c.env.BUCKET.delete(photo.file_key)
  await c.env.DB.prepare('DELETE FROM event_photos WHERE id = ?').bind(photoId).run()

  await writeLog({
    db: c.env.DB, adminEmail: c.get('adminEmail'),
    action: 'delete', targetType: 'event_photo',
    targetId: Number(photoId), detail: `이벤트 ID ${eventId} 사진 삭제`,
  })

  return c.json({ success: true })
})

// 음악 업로드 (관리자 전용)
events.post('/:id/music', requirePermission('event'), async (c) => {
  const id = c.req.param('id')
  const existing = await c.env.DB.prepare(
    'SELECT id, music_key FROM events WHERE id = ?'
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
  const fileKey = `events/${id}/${uuid}.${ext}`
  await c.env.BUCKET.put(fileKey, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type || 'audio/mpeg' },
  })

  await c.env.DB.prepare(
    "UPDATE events SET music_key = ?, updated_at = datetime('now') WHERE id = ?"
  ).bind(fileKey, id).run()

  return c.json({ success: true, fileKey }, 201)
})

// 음악 삭제 (관리자 전용)
events.delete('/:id/music', requirePermission('event'), async (c) => {
  const id = c.req.param('id')
  const existing = await c.env.DB.prepare(
    'SELECT id, music_key FROM events WHERE id = ?'
  ).bind(id).first<{ id: number; music_key: string | null }>()
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (!existing.music_key) return c.json({ error: 'No music attached' }, 404)

  await c.env.BUCKET.delete(existing.music_key)
  await c.env.DB.prepare(
    "UPDATE events SET music_key = NULL, updated_at = datetime('now') WHERE id = ?"
  ).bind(id).run()

  return c.json({ success: true })
})

// 이벤트 삭제 (관리자 전용, 사진·음악 R2 정리 포함)
events.delete('/:id', requirePermission('event'), async (c) => {
  const id = c.req.param('id')
  const existing = await c.env.DB.prepare('SELECT id, title, music_key FROM events WHERE id = ?')
    .bind(id).first<{ id: number; title: string; music_key: string | null }>()
  if (!existing) return c.json({ error: 'Not found' }, 404)

  const { results: photos } = await c.env.DB.prepare(
    'SELECT file_key FROM event_photos WHERE event_id = ?'
  ).bind(id).all<{ file_key: string }>()
  await Promise.all(photos.map((p) => c.env.BUCKET.delete(p.file_key)))

  // 첨부 음악 R2 정리
  if (existing.music_key) {
    await c.env.BUCKET.delete(existing.music_key)
  }

  await c.env.DB.prepare('DELETE FROM event_photos WHERE event_id = ?').bind(id).run()
  await c.env.DB.prepare('DELETE FROM events WHERE id = ?').bind(id).run()

  await writeLog({
    db: c.env.DB, adminEmail: c.get('adminEmail'),
    action: 'delete', targetType: 'event',
    targetId: Number(id), detail: existing.title,
  })

  return c.json({ success: true })
})

export default events
