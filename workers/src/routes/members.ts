import { Hono } from 'hono'
import type { Env, Variables } from '../types'
import { requirePermission, requireSuperAdmin } from '../middleware/admin'
import { writeLog } from '../lib/logger'

const members = new Hono<{ Bindings: Env; Variables: Variables }>()

// 활동중인 멤버 목록
members.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM members WHERE is_active = 1 ORDER BY role ASC, nickname ASC'
  ).all()
  return c.json(results)
})

// 멤버 추가 (최상위 관리자 전용)
members.post('/', requireSuperAdmin, async (c) => {
  const { nickname, role, joined_at, bio } = await c.req.json<{
    nickname: string
    role: string
    joined_at?: string
    bio?: string
  }>()
  if (!nickname || !role) {
    return c.json({ error: 'nickname, role은 필수입니다' }, 400)
  }
  const existing = await c.env.DB.prepare(
    'SELECT id FROM members WHERE nickname = ? AND is_active = 1'
  ).bind(nickname).first()
  if (existing) {
    return c.json({ error: `이미 '${nickname}' 닉네임의 멤버가 존재합니다.` }, 409)
  }
  const result = await c.env.DB.prepare(
    'INSERT INTO members (nickname, role, joined_at, bio, is_active) VALUES (?, ?, ?, ?, 1)'
  ).bind(nickname, role, joined_at ?? null, bio ?? null).run()

  await writeLog({
    db: c.env.DB, adminEmail: c.get('adminEmail'),
    action: 'create', targetType: 'member',
    targetId: result.meta.last_row_id as number, detail: `${nickname} (${role})`,
  })

  return c.json({ id: result.meta.last_row_id }, 201)
})

// 멤버 수정 (최상위 관리자 전용)
members.put('/:id', requireSuperAdmin, async (c) => {
  const id = c.req.param('id')
  const { nickname, role, joined_at, bio } = await c.req.json<{
    nickname: string
    role: string
    joined_at?: string
    bio?: string
  }>()
  const existing = await c.env.DB.prepare(
    'SELECT id FROM members WHERE id = ?'
  ).bind(id).first()
  if (!existing) return c.json({ error: 'Not found' }, 404)

  const duplicate = await c.env.DB.prepare(
    'SELECT id FROM members WHERE nickname = ? AND is_active = 1 AND id != ?'
  ).bind(nickname, id).first()
  if (duplicate) {
    return c.json({ error: `이미 '${nickname}' 닉네임의 멤버가 존재합니다.` }, 409)
  }

  await c.env.DB.prepare(
    'UPDATE members SET nickname = ?, role = ?, joined_at = ?, bio = ? WHERE id = ?'
  ).bind(nickname, role, joined_at ?? null, bio ?? null, id).run()

  await writeLog({
    db: c.env.DB, adminEmail: c.get('adminEmail'),
    action: 'update', targetType: 'member',
    targetId: Number(id), detail: `${nickname} (${role})`,
  })

  return c.json({ success: true })
})

// 멤버 소개 수정 (일반 관리자 이상)
members.patch('/:id/bio', requirePermission('member'), async (c) => {
  const id = c.req.param('id')
  const { bio } = await c.req.json<{ bio: string }>()
  const existing = await c.env.DB.prepare(
    'SELECT id, nickname FROM members WHERE id = ?'
  ).bind(id).first<{ id: number; nickname: string }>()
  if (!existing) return c.json({ error: 'Not found' }, 404)

  // 일반 관리자는 자기 자신의 소개글 수정 불가 (최상위 관리자는 허용)
  const adminEmail = c.get('adminEmail')
  const isSuperAdmin = c.env.SUPER_ADMIN_EMAILS.split(',').map((e) => e.trim()).includes(adminEmail)
  if (!isSuperAdmin) {
    const adminNicknameRow = await c.env.DB.prepare(
      'SELECT nickname FROM admin_nicknames WHERE email = ?'
    ).bind(adminEmail).first<{ nickname: string }>()
    if (adminNicknameRow?.nickname === existing.nickname) {
      return c.json({ error: '자신의 소개글은 직접 수정할 수 없습니다' }, 403)
    }
  }

  await c.env.DB.prepare(
    'UPDATE members SET bio = ? WHERE id = ?'
  ).bind(bio ?? null, id).run()

  await writeLog({
    db: c.env.DB, adminEmail: c.get('adminEmail'),
    action: 'patch', targetType: 'member',
    targetId: Number(id), detail: `${existing.nickname} 소개 수정`,
  })

  return c.json({ success: true })
})

// 멤버 삭제 (최상위 관리자 전용 - is_active = 0으로 소프트 삭제)
members.delete('/:id', requireSuperAdmin, async (c) => {
  const id = c.req.param('id')
  const existing = await c.env.DB.prepare(
    'SELECT id, nickname, role FROM members WHERE id = ?'
  ).bind(id).first<{ id: number; nickname: string; role: string }>()
  if (!existing) return c.json({ error: 'Not found' }, 404)

  await c.env.DB.prepare(
    'UPDATE members SET is_active = 0 WHERE id = ?'
  ).bind(id).run()

  await writeLog({
    db: c.env.DB, adminEmail: c.get('adminEmail'),
    action: 'delete', targetType: 'member',
    targetId: Number(id), detail: `${existing.nickname} (${existing.role})`,
  })

  return c.json({ success: true })
})

export default members
