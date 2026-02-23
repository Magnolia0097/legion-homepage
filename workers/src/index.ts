import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Env } from './types'
import { verifyFirebaseToken } from './auth'
import noticesRoute from './routes/notices'
import galleryRoute from './routes/gallery'
import membersRoute from './routes/members'

const app = new Hono<{ Bindings: Env }>()

// ─── IP 기반 Rate Limiting (Workers 인메모리, IP당 분당 200req) ───
const ipCountMap = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT = 200
const WINDOW_MS  = 60_000

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = ipCountMap.get(ip)
  if (!entry || now > entry.resetAt) {
    ipCountMap.set(ip, { count: 1, resetAt: now + WINDOW_MS })
    return true
  }
  entry.count++
  return entry.count <= RATE_LIMIT
}

app.use('/api/*', async (c, next) => {
  const ip = c.req.header('CF-Connecting-IP') ?? 'unknown'
  if (!checkRateLimit(ip)) {
    return c.json({ error: 'Too Many Requests' }, 429)
  }
  await next()
})

// CORS 설정 - Pages 도메인만 허용
app.use('/api/*', cors({
  origin: (origin) => {
    const allowed = [
      'http://localhost:3000',
      'https://legion-homepage.pages.dev',
      'https://legion-homepage-magnolia0097.pages.dev',
    ]
    return allowed.includes(origin) ? origin : null
  },
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
}))

// ─── 라우트 마운트 ───
app.route('/api/notices', noticesRoute)
app.route('/api/gallery', galleryRoute)
app.route('/api/members', membersRoute)

// 인증 토큰 검증 엔드포인트
app.post('/api/auth/verify', async (c) => {
  const authHeader = c.req.header('Authorization')
  const token = authHeader?.replace('Bearer ', '')
  if (!token) return c.json({ valid: false, error: 'No token' }, 401)

  const result = await verifyFirebaseToken(token, c.env.FIREBASE_PROJECT_ID)
  if (!result) return c.json({ valid: false, error: 'Invalid token' }, 401)

  const adminEmails = c.env.ADMIN_EMAILS.split(',').map((e: string) => e.trim())
  const isAdmin = adminEmails.includes(result.email)

  return c.json({ valid: true, email: result.email, isAdmin })
})

// 헬스 체크
app.get('/api/health', (c) => c.json({ status: 'ok' }))

export default app
