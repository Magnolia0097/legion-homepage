import { Hono } from 'hono'
import type { Env } from '../types'

const gallery = new Hono<{ Bindings: Env }>()

// 날짜 목록 (사진첩 진입 페이지용)
gallery.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT DISTINCT taken_date FROM gallery ORDER BY taken_date DESC'
  ).all()
  return c.json(results)
})

// 특정 날짜 사진 목록
gallery.get('/:date', async (c) => {
  const date = c.req.param('date')
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM gallery WHERE taken_date = ? ORDER BY created_at ASC'
  ).bind(date).all()
  return c.json(results)
})

// 사진 업로드 (관리자 전용)
gallery.post('/upload', async (c) => {
  const formData = await c.req.formData()
  const file = formData.get('file') as File | null
  const description = (formData.get('description') as string) ?? ''
  const taken_date = formData.get('taken_date') as string | null
  const uploader = formData.get('uploader') as string | null

  if (!file || !taken_date || !uploader) {
    return c.json({ error: 'file, taken_date, uploader는 필수입니다' }, 400)
  }

  const uuid = crypto.randomUUID()
  const fileKey = `gallery/${taken_date}/${uuid}.webp`
  const arrayBuffer = await file.arrayBuffer()

  await c.env.BUCKET.put(fileKey, arrayBuffer, {
    httpMetadata: { contentType: 'image/webp' },
  })

  await c.env.DB.prepare(
    'INSERT INTO gallery (file_key, description, taken_date, uploader) VALUES (?, ?, ?, ?)'
  ).bind(fileKey, description, taken_date, uploader).run()

  return c.json({ success: true, fileKey }, 201)
})

// 사진 삭제 (관리자 전용) - R2 파일 + D1 메타데이터 동시 삭제
gallery.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const photo = await c.env.DB.prepare(
    'SELECT file_key FROM gallery WHERE id = ?'
  ).bind(id).first<{ file_key: string }>()

  if (!photo) return c.json({ error: 'Not found' }, 404)

  await c.env.BUCKET.delete(photo.file_key)
  await c.env.DB.prepare('DELETE FROM gallery WHERE id = ?').bind(id).run()

  return c.json({ success: true })
})

export default gallery
