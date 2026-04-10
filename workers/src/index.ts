import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Env, Variables } from './types'
import { verifyFirebaseToken } from './auth'
import noticesRoute from './routes/notices'
import galleryRoute from './routes/gallery'
import membersRoute from './routes/members'
import eventsRoute from './routes/events'
import adminAccountsRoute from './routes/admin-accounts'
import adminLogsRoute from './routes/admin-logs'
import usersRoute from './routes/users'
import commentsRoute from './routes/comments'
import siteSettingsRoute from './routes/site-settings'
import inviteRoute from './routes/invite'
import gameRoute from './routes/game'
import marbleRoute from './routes/marble'
import rpgRoute from './routes/rpg'

const app = new Hono<{ Bindings: Env; Variables: Variables }>()

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
      'http://127.0.0.1:3000',
      'https://legion-homepage.pages.dev',
      'https://legion-homepage-magnolia0097.pages.dev',
      'https://nania-ssimdang.pages.dev',
    ]
    return allowed.includes(origin) ? origin : null
  },
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
}))

// API GET 응답 캐시 완전 방지 (Cloudflare 엣지 + 브라우저 캐시 모두 차단)
app.use('/api/*', async (c, next) => {
  await next()
  if (c.req.method === 'GET') {
    c.res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate')
    c.res.headers.set('Pragma', 'no-cache')
  }
})

// ─── 라우트 마운트 ───
app.route('/api/notices', noticesRoute)
app.route('/api/gallery', galleryRoute)
app.route('/api/members', membersRoute)
app.route('/api/events', eventsRoute)
app.route('/api/admin-accounts', adminAccountsRoute)
app.route('/api/admin-logs', adminLogsRoute)
app.route('/api/users', usersRoute)
app.route('/api/comments', commentsRoute)
app.route('/api/site-settings', siteSettingsRoute)
app.route('/api/invite', inviteRoute)
app.route('/api/game', gameRoute)
app.route('/api/marble', marbleRoute)
app.route('/api/rpg', rpgRoute)

// 인증 토큰 검증 엔드포인트
app.post('/api/auth/verify', async (c) => {
  const authHeader = c.req.header('Authorization')
  const token = authHeader?.replace('Bearer ', '')
  if (!token) return c.json({ valid: false, error: 'No token' }, 401)

  const result = await verifyFirebaseToken(token, c.env.FIREBASE_PROJECT_ID)
  if (!result) return c.json({ valid: false, error: 'Invalid token' }, 401)

  const email = result.email.toLowerCase()
  const superAdminEmails = c.env.SUPER_ADMIN_EMAILS.split(',').map((e: string) => e.trim().toLowerCase())
  const isSuperAdmin = superAdminEmails.includes(email)

  // 일반 관리자 DB 확인 (permissions 포함)
  const adminRow = isSuperAdmin
    ? null
    : await c.env.DB.prepare(
        'SELECT id, permissions FROM admins WHERE LOWER(email) = ?'
      ).bind(email).first<{ id: number; permissions: string }>()
  const isAdmin = isSuperAdmin || !!adminRow

  // permissions 파싱: 최상위 관리자는 전체 권한, 일반 관리자는 DB 값
  let permissions: string[] = []
  if (isSuperAdmin) {
    permissions = ['notice', 'gallery', 'event', 'member']
  } else if (adminRow) {
    try { permissions = JSON.parse(adminRow.permissions) ?? [] } catch { permissions = [] }
  }

  // 닉네임 조회
  const nicknameRow = await c.env.DB.prepare(
    'SELECT nickname FROM admin_nicknames WHERE LOWER(email) = ?'
  ).bind(email).first<{ nickname: string }>()
  const nickname = nicknameRow?.nickname ?? ''

  // 일반 사용자 여부 확인
  const userRow = isAdmin
    ? null
    : await c.env.DB.prepare(
        'SELECT id, nickname FROM users WHERE LOWER(email) = ?'
      ).bind(email).first<{ id: number; nickname: string }>()
  const isUser = !isAdmin && !!userRow
  const userNickname = userRow?.nickname ?? ''

  return c.json({ valid: true, email, isAdmin, isSuperAdmin, permissions, nickname, isUser, userNickname })
})

// 내 닉네임 설정 (모든 관리자 - 최상위·일반 공통)
app.patch('/api/auth/nickname', async (c) => {
  const authHeader = c.req.header('Authorization')
  const token = authHeader?.replace('Bearer ', '')
  if (!token) return c.json({ error: 'Unauthorized' }, 401)

  const result = await verifyFirebaseToken(token, c.env.FIREBASE_PROJECT_ID)
  if (!result) return c.json({ error: 'Invalid token' }, 401)

  // 최상위 관리자 or DB에 존재하는 일반 관리자인지 확인
  const nicknameEmail = result.email.toLowerCase()
  const superAdminEmailsForNickname = c.env.SUPER_ADMIN_EMAILS.split(',').map((e: string) => e.trim().toLowerCase())
  const isSuperAdminForNickname = superAdminEmailsForNickname.includes(nicknameEmail)
  if (!isSuperAdminForNickname) {
    const adminRow = await c.env.DB.prepare(
      'SELECT id FROM admins WHERE LOWER(email) = ?'
    ).bind(nicknameEmail).first()
    if (!adminRow) return c.json({ error: 'Forbidden' }, 403)
  }

  const { nickname } = await c.req.json<{ nickname: string }>()
  if (typeof nickname !== 'string') return c.json({ error: 'nickname은 문자열이어야 합니다' }, 400)

  await c.env.DB.prepare(
    'INSERT OR REPLACE INTO admin_nicknames (email, nickname) VALUES (?, ?)'
  ).bind(nicknameEmail, nickname.trim()).run()

  return c.json({ success: true, nickname: nickname.trim() })
})

// 헬스 체크
app.get('/api/health', (c) => c.json({ status: 'ok' }))

export default app
