import { Hono } from 'hono'
import type { Env, Variables } from '../types'
import { requirePermission, requireSuperAdmin } from '../middleware/admin'
import { writeLog } from '../lib/logger'
import { verifyFirebaseToken } from '../auth'

const gallery = new Hono<{ Bindings: Env; Variables: Variables }>()

// 월별 업로드 제한
const MONTHLY_PHOTO_LIMIT = 30

// 연/월 그룹 목록 반환 (썸네일: 이달의 모델 우선, 없으면 첫 번째 사진)
gallery.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(`
    SELECT
      substr(g.taken_date, 1, 7) AS year_month,
      COUNT(*) AS count,
      COALESCE(
        (SELECT g2.file_key FROM gallery g2
         WHERE substr(g2.taken_date, 1, 7) = substr(g.taken_date, 1, 7)
           AND g2.is_featured = 1
         ORDER BY g2.taken_date DESC, g2.created_at DESC
         LIMIT 1),
        (SELECT g2.file_key FROM gallery g2
         WHERE substr(g2.taken_date, 1, 7) = substr(g.taken_date, 1, 7)
         ORDER BY g2.taken_date ASC, g2.created_at ASC
         LIMIT 1)
      ) AS thumbnail_key,
      CASE WHEN EXISTS (
        SELECT 1 FROM gallery g2
        WHERE substr(g2.taken_date, 1, 7) = substr(g.taken_date, 1, 7)
          AND g2.is_featured = 1
      ) THEN 1 ELSE 0 END AS has_featured
    FROM gallery g
    GROUP BY year_month
    ORDER BY year_month DESC
  `).all()
  return c.json(results)
})

// ─── 이달의 모델 최신 1개 (홈 히어로용, 공개) ───
gallery.get('/featured', async (c) => {
  const row = await c.env.DB.prepare(
    'SELECT * FROM gallery WHERE is_featured = 1 ORDER BY taken_date DESC, created_at DESC LIMIT 1'
  ).first()
  if (!row) return c.json(null)
  return c.json(row)
})

// ─── 이달의 모델 전체 목록 (최고관리자 전용) ───
gallery.get('/featured/all', requireSuperAdmin, async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM gallery WHERE is_featured = 1 ORDER BY taken_date DESC, created_at DESC'
  ).all()
  return c.json(results)
})

// 특정 연/월 사진 목록 (YYYY-MM 형식)
gallery.get('/:yearmonth', async (c) => {
  const ym = c.req.param('yearmonth')
  if (!/^\d{4}-\d{2}$/.test(ym)) {
    return c.json({ error: 'YYYY-MM 형식이어야 합니다' }, 400)
  }
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM gallery WHERE substr(taken_date, 1, 7) = ? ORDER BY taken_date ASC, created_at ASC'
  ).bind(ym).all()
  return c.json(results)
})

// 특정 월 현재 업로드 수 조회 (관리자용)
gallery.get('/:yearmonth/count', requirePermission('gallery'), async (c) => {
  const ym = c.req.param('yearmonth')
  if (!/^\d{4}-\d{2}$/.test(ym)) {
    return c.json({ error: 'YYYY-MM 형식이어야 합니다' }, 400)
  }
  const row = await c.env.DB.prepare(
    'SELECT COUNT(*) AS count FROM gallery WHERE substr(taken_date, 1, 7) = ?'
  ).bind(ym).first<{ count: number }>()
  return c.json({ count: row?.count ?? 0, limit: MONTHLY_PHOTO_LIMIT })
})

// ─── 좋아요 조회 ───
gallery.get('/:id/likes', async (c) => {
  const id = c.req.param('id')

  const countRow = await c.env.DB.prepare(
    'SELECT COUNT(*) AS cnt FROM gallery_likes WHERE photo_id = ?'
  ).bind(id).first<{ cnt: number }>()
  const count = countRow?.cnt ?? 0

  let liked = false
  const identifier = await resolveIdentifier(c)
  if (identifier) {
    const row = await c.env.DB.prepare(
      'SELECT id FROM gallery_likes WHERE photo_id = ? AND user_identifier = ?'
    ).bind(id, identifier).first()
    liked = !!row
  }

  return c.json({ count, liked })
})

// ─── 좋아요 토글 ───
gallery.post('/:id/likes', async (c) => {
  const id = c.req.param('id')
  const identifier = await resolveIdentifier(c)
  if (!identifier) return c.json({ error: 'Unauthorized' }, 401)

  const existing = await c.env.DB.prepare(
    'SELECT id FROM gallery_likes WHERE photo_id = ? AND user_identifier = ?'
  ).bind(id, identifier).first()

  if (existing) {
    await c.env.DB.prepare(
      'DELETE FROM gallery_likes WHERE photo_id = ? AND user_identifier = ?'
    ).bind(id, identifier).run()
  } else {
    await c.env.DB.prepare(
      'INSERT INTO gallery_likes (photo_id, user_identifier) VALUES (?, ?)'
    ).bind(id, identifier).run()
  }

  const countRow = await c.env.DB.prepare(
    'SELECT COUNT(*) AS cnt FROM gallery_likes WHERE photo_id = ?'
  ).bind(id).first<{ cnt: number }>()

  return c.json({ liked: !existing, count: countRow?.cnt ?? 0 })
})

// 사진 업로드 (관리자 전용)
gallery.post('/upload', requirePermission('gallery'), async (c) => {
  const formData = await c.req.formData()
  const file = formData.get('file') as File | null
  const description = (formData.get('description') as string) ?? ''
  const taken_date = formData.get('taken_date') as string | null
  const uploader = formData.get('uploader') as string | null

  // 이달의 모델 관련 필드 (최고관리자만 사용)
  const isFeaturedRaw = formData.get('is_featured') as string | null
  const is_featured = isFeaturedRaw === '1' ? 1 : 0
  const hero_title = (formData.get('hero_title') as string | null) ?? null
  const hero_desc = (formData.get('hero_desc') as string | null) ?? null
  const musicFile = formData.get('music') as File | null

  if (!file || !taken_date || !uploader) {
    return c.json({ error: 'file, taken_date, uploader는 필수입니다' }, 400)
  }

  const yearMonth = taken_date.slice(0, 7)
  const countRow = await c.env.DB.prepare(
    'SELECT COUNT(*) AS count FROM gallery WHERE substr(taken_date, 1, 7) = ?'
  ).bind(yearMonth).first<{ count: number }>()
  const currentCount = countRow?.count ?? 0

  if (currentCount >= MONTHLY_PHOTO_LIMIT) {
    return c.json(
      { error: `월별 업로드 한도(${MONTHLY_PHOTO_LIMIT}장)에 도달했습니다. (현재 ${currentCount}장)` },
      429
    )
  }

  const uuid = crypto.randomUUID()
  const fileKey = `gallery/${yearMonth}/${uuid}.webp`
  const arrayBuffer = await file.arrayBuffer()

  await c.env.BUCKET.put(fileKey, arrayBuffer, {
    httpMetadata: { contentType: 'image/webp' },
  })

  // 음악 파일 업로드 (선택)
  let music_key: string | null = null
  if (musicFile && musicFile.size > 0) {
    const musicUuid = crypto.randomUUID()
    const ext = musicFile.name.split('.').pop() ?? 'mp3'
    music_key = `gallery/music/${yearMonth}/${musicUuid}.${ext}`
    const musicBuffer = await musicFile.arrayBuffer()
    await c.env.BUCKET.put(music_key, musicBuffer, {
      httpMetadata: { contentType: musicFile.type || 'audio/mpeg' },
    })
  }

  const result = await c.env.DB.prepare(
    `INSERT INTO gallery
       (file_key, description, taken_date, uploader, is_featured, music_key, hero_title, hero_desc)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(fileKey, description, taken_date, uploader, is_featured, music_key, hero_title, hero_desc).run()

  await writeLog({
    db: c.env.DB, adminEmail: c.get('adminEmail'),
    action: 'create', targetType: 'gallery',
    targetId: result.meta.last_row_id as number,
    detail: `${yearMonth} 사진 업로드 (${currentCount + 1}/${MONTHLY_PHOTO_LIMIT}장)${is_featured ? ' [이달의 모델]' : ''}`,
  })

  return c.json({ success: true, fileKey, count: currentCount + 1, limit: MONTHLY_PHOTO_LIMIT }, 201)
})

// 사진 삭제 (관리자 전용)
gallery.delete('/:id', requirePermission('gallery'), async (c) => {
  const id = c.req.param('id')
  const photo = await c.env.DB.prepare(
    'SELECT file_key, taken_date, music_key FROM gallery WHERE id = ?'
  ).bind(id).first<{ file_key: string; taken_date: string; music_key: string | null }>()

  if (!photo) return c.json({ error: 'Not found' }, 404)

  await c.env.BUCKET.delete(photo.file_key)
  if (photo.music_key) await c.env.BUCKET.delete(photo.music_key)
  await c.env.DB.prepare('DELETE FROM gallery WHERE id = ?').bind(id).run()

  await writeLog({
    db: c.env.DB, adminEmail: c.get('adminEmail'),
    action: 'delete', targetType: 'gallery',
    targetId: Number(id), detail: `${photo.taken_date.slice(0, 7)} 사진 삭제`,
  })

  return c.json({ success: true })
})

// ─── 사용자 식별자 추출 (로그인: 이메일, 비로그인: IP) ───
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveIdentifier(c: any): Promise<string | null> {
  const authHeader = c.req.header('Authorization') as string | undefined
  const token = authHeader?.replace('Bearer ', '')
  if (token) {
    const result = await verifyFirebaseToken(token, (c.env as Env).FIREBASE_PROJECT_ID)
    if (result?.email) return `email:${result.email.toLowerCase()}`
  }
  const ip = c.req.header('CF-Connecting-IP') as string | undefined
  if (ip) return `ip:${ip}`
  return null
}

export default gallery
