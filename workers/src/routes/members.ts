import { Hono } from 'hono'
import type { Env } from '../types'

const members = new Hono<{ Bindings: Env }>()

// 활동중인 멤버 목록
members.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM members WHERE is_active = 1 ORDER BY role ASC'
  ).all()
  return c.json(results)
})

export default members
