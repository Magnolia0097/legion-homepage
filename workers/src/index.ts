import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Env } from './types'
import { verifyFirebaseToken } from './auth'
import noticesRoute from './routes/notices'
import galleryRoute from './routes/gallery'
import membersRoute from './routes/members'

const app = new Hono<{ Bindings: Env }>()

// CORS 설정 - Pages 도메인만 허용 (배포 후 실제 도메인으로 교체)
app.use('/api/*', cors({
  origin: (origin) => {
    const allowed = [
      'http://localhost:3000',
      'https://legion-homepage.pages.dev',
    ]
    return allowed.includes(origin) ? origin : null
  },
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
}))

// 관리자 인증 미들웨어
async function requireAdmin(c: any, next: any) {
  const authHeader = c.req.header('Authorization')
  const token = authHeader?.replace('Bearer ', '')
  if (!token) return c.json({ error: 'Unauthorized' }, 401)

  const result = await verifyFirebaseToken(token, c.env.FIREBASE_PROJECT_ID)
  if (!result) return c.json({ error: 'Invalid token' }, 401)

  const adminEmails = c.env.ADMIN_EMAILS.split(',').map((e: string) => e.trim())
  if (!adminEmails.includes(result.email)) {
    return c.json({ error: 'Forbidden: 관리자 권한이 없습니다' }, 403)
  }

  await next()
}

// 공지사항 라우트
app.get('/api/notices', (c) => noticesRoute.fetch(c.req.raw, c.env))
app.get('/api/notices/:id', (c) => noticesRoute.fetch(c.req.raw, c.env))
app.post('/api/notices', requireAdmin, (c) => noticesRoute.fetch(c.req.raw, c.env))
app.put('/api/notices/:id', requireAdmin, (c) => noticesRoute.fetch(c.req.raw, c.env))
app.delete('/api/notices/:id', requireAdmin, (c) => noticesRoute.fetch(c.req.raw, c.env))

// 사진첩 라우트
app.get('/api/gallery', (c) => galleryRoute.fetch(c.req.raw, c.env))
app.get('/api/gallery/:date', (c) => galleryRoute.fetch(c.req.raw, c.env))
app.post('/api/gallery/upload', requireAdmin, (c) => galleryRoute.fetch(c.req.raw, c.env))
app.delete('/api/gallery/:id', requireAdmin, (c) => galleryRoute.fetch(c.req.raw, c.env))

// 멤버 라우트
app.get('/api/members', (c) => membersRoute.fetch(c.req.raw, c.env))

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
