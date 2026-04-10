import { Hono } from 'hono'
import type { Env, Variables, Comment } from '../types'
import { requireLoggedInUser } from '../middleware/user'
import { requireAdmin } from '../middleware/admin'

const comments = new Hono<{ Bindings: Env; Variables: Variables }>()

// 댓글 목록 조회 (공개)
// GET /api/comments/:targetType/:targetId
comments.get('/:targetType/:targetId', async (c) => {
  const { targetType, targetId } = c.req.param()
  if (!['notice', 'event', 'gallery'].includes(targetType)) {
    return c.json({ error: '잘못된 target_type입니다' }, 400)
  }

  const { results } = await c.env.DB.prepare(
    `SELECT id, author_nickname, content, created_at
     FROM comments
     WHERE target_type = ? AND target_id = ?
     ORDER BY created_at ASC`
  ).bind(targetType, Number(targetId)).all<Pick<Comment, 'id' | 'author_nickname' | 'content' | 'created_at'>>()

  return c.json(results)
})

// 댓글 작성 (로그인된 사용자 전용)
// POST /api/comments/:targetType/:targetId
comments.post('/:targetType/:targetId', requireLoggedInUser, async (c) => {
  const { targetType, targetId } = c.req.param()
  if (!['notice', 'event', 'gallery'].includes(targetType)) {
    return c.json({ error: '잘못된 target_type입니다' }, 400)
  }

  const { content } = await c.req.json<{ content: string }>()
  if (!content?.trim()) {
    return c.json({ error: '댓글 내용을 입력해주세요' }, 400)
  }
  if (content.trim().length > 500) {
    return c.json({ error: '댓글은 500자 이내로 작성해주세요' }, 400)
  }

  const authorEmail = c.get('userEmail')
  const authorNickname = c.get('userNickname')

  const result = await c.env.DB.prepare(
    `INSERT INTO comments (target_type, target_id, author_email, author_nickname, content)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(targetType, Number(targetId), authorEmail, authorNickname, content.trim()).run()

  return c.json({
    id: result.meta.last_row_id,
    author_nickname: authorNickname,
    content: content.trim(),
    created_at: new Date().toISOString(),
  }, 201)
})

// 댓글 삭제 (관리자 전용 또는 작성자 본인)
// DELETE /api/comments/:id
comments.delete('/:id', requireLoggedInUser, async (c) => {
  const id = c.req.param('id')
  const userEmail = c.get('userEmail')

  const existing = await c.env.DB.prepare(
    'SELECT id, author_email FROM comments WHERE id = ?'
  ).bind(id).first<{ id: number; author_email: string }>()
  if (!existing) return c.json({ error: 'Not found' }, 404)

  // 본인 댓글이거나 관리자면 삭제 가능
  const superAdmins = c.env.SUPER_ADMIN_EMAILS.split(',').map((e) => e.trim().toLowerCase())
  const isSuperAdmin = superAdmins.includes(userEmail.toLowerCase())
  const isOwn = existing.author_email.toLowerCase() === userEmail.toLowerCase()

  if (!isSuperAdmin && !isOwn) {
    // 일반 관리자도 삭제 가능
    const adminRow = await c.env.DB.prepare(
      'SELECT id FROM admins WHERE LOWER(email) = ?'
    ).bind(userEmail.toLowerCase()).first()
    if (!adminRow) {
      return c.json({ error: 'Forbidden' }, 403)
    }
  }

  await c.env.DB.prepare('DELETE FROM comments WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

export default comments
