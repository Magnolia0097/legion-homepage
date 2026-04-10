import { Hono } from 'hono'
import type { Env, Variables } from '../types'
import { requireLoggedInUser } from '../middleware/user'

const app = new Hono<{ Bindings: Env; Variables: Variables }>()

// ─── 구슬 타입 정의 ───

interface MarbleType {
  id: string
  name: string
  radius: number
  mass: number
  restitution: number   // 탄성 (0~1)
  color: string
  glow?: string
  rarity: 'common' | 'rare' | 'epic' | 'legendary'
}

const MARBLE_TYPES: Record<string, MarbleType> = {
  glass:   { id: 'glass',   name: '유리구슬',   radius: 14, mass: 1.0, restitution: 0.7, color: '#7ec8e3', rarity: 'common' },
  steel:   { id: 'steel',   name: '쇠구슬',     radius: 13, mass: 2.0, restitution: 0.5, color: '#a0a0a8', rarity: 'rare' },
  king:    { id: 'king',    name: '왕구슬',     radius: 20, mass: 2.5, restitution: 0.6, color: '#e8c850', glow: 'rgba(232,200,80,0.4)', rarity: 'rare' },
  ruby:    { id: 'ruby',    name: '루비구슬',    radius: 14, mass: 1.2, restitution: 0.8, color: '#e05050', glow: 'rgba(224,80,80,0.3)', rarity: 'epic' },
  emerald: { id: 'emerald', name: '에메랄드구슬', radius: 14, mass: 1.2, restitution: 0.8, color: '#40c070', glow: 'rgba(64,192,112,0.3)', rarity: 'epic' },
  rainbow: { id: 'rainbow', name: '무지개구슬',   radius: 15, mass: 1.3, restitution: 0.85, color: 'rainbow', glow: 'rgba(200,100,255,0.4)', rarity: 'legendary' },
}

// 신규 유저 기본 지급
const STARTER_MARBLES: Record<string, number> = { glass: 20, steel: 3 }

// ─── 게임 상태 ───

interface Vec2 { x: number; y: number }

interface MarbleState {
  id: string          // 소유자 playerId
  type: string        // marble type id
  pos: Vec2
  vel: Vec2
  radius: number
  mass: number
  restitution: number
  eliminated: boolean // 원 밖으로 나갔는지
}

interface GameState {
  phase: 'waiting' | 'playing' | 'aiming' | 'simulating' | 'finished'
  marbles: MarbleState[]
  turnOrder: string[]
  currentTurnIndex: number
  roundNumber: number
  maxRounds: number
  arenaRadius: number
  results: { playerId: string; eliminated: boolean; rank: number }[]
  lastShot: { playerId: string; angle: number; power: number } | null
}

const ARENA_RADIUS = 140
const AI_NAMES = ['흑기사', '백마법사', '불사조', '얼음여왕', '그림자', '천둥번개', '달빛검사', '바람도적']

function generateRoomId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let id = ''
  for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)]
  return id
}

// 원 안 무작위 위치 (가장자리 근처)
function randomPosInRing(arenaR: number, marbleR: number): Vec2 {
  const minR = arenaR * 0.3
  const maxR = arenaR - marbleR - 4
  const r = minR + Math.random() * (maxR - minR)
  const a = Math.random() * Math.PI * 2
  return { x: Math.cos(a) * r, y: Math.sin(a) * r }
}

// 인벤토리 보장 (없으면 스타터 지급)
async function ensureInventory(db: D1Database, email: string) {
  const existing = await db.prepare(
    'SELECT COUNT(*) as cnt FROM marble_inventory WHERE owner = ?'
  ).bind(email).first<{ cnt: number }>()
  if ((existing?.cnt ?? 0) === 0) {
    for (const [type, count] of Object.entries(STARTER_MARBLES)) {
      await db.prepare(
        'INSERT OR IGNORE INTO marble_inventory (owner, marble_type, count) VALUES (?, ?, ?)'
      ).bind(email, type, count).run()
    }
  }
}

// ─── API 엔드포인트 ───

// 구슬 타입 목록
app.get('/types', (c) => c.json(MARBLE_TYPES))

// 내 인벤토리 조회
app.get('/inventory', requireLoggedInUser, async (c) => {
  const email = c.get('userEmail')
  await ensureInventory(c.env.DB, email)

  const rows = await c.env.DB.prepare(
    'SELECT marble_type, count FROM marble_inventory WHERE owner = ? AND count > 0'
  ).bind(email).all()

  return c.json(rows.results ?? [])
})

// 방 목록
app.get('/rooms', async (c) => {
  // 오래된 방 정리
  await c.env.DB.prepare(
    `DELETE FROM marble_players WHERE room_id IN (
       SELECT id FROM marble_rooms WHERE
         (status = 'finished' AND updated_at < datetime('now', '-1 hour'))
         OR updated_at < datetime('now', '-3 hours')
     )`
  ).run()
  await c.env.DB.prepare(
    `DELETE FROM marble_rooms WHERE
       (status = 'finished' AND updated_at < datetime('now', '-1 hour'))
       OR updated_at < datetime('now', '-3 hours')`
  ).run()

  const rooms = await c.env.DB.prepare(
    `SELECT r.id, r.host_name, r.max_players, r.bet_amount, r.status,
            (SELECT COUNT(*) FROM marble_players WHERE room_id = r.id) as player_count
     FROM marble_rooms r
     WHERE r.status IN ('waiting', 'playing')
     ORDER BY r.created_at DESC LIMIT 20`
  ).all()
  return c.json(rooms.results ?? [])
})

// 방 생성
app.post('/rooms', requireLoggedInUser, async (c) => {
  const email = c.get('userEmail')
  const nickname = c.get('userNickname')
  const { maxPlayers, betAmount, marbleType } = await c.req.json<{
    maxPlayers?: number
    betAmount?: number
    marbleType?: string
  }>()
  const max = Math.min(Math.max(maxPlayers ?? 4, 2), 6)
  const bet = Math.min(Math.max(betAmount ?? 1, 1), 10)
  const mType = marbleType && MARBLE_TYPES[marbleType] ? marbleType : 'glass'

  await ensureInventory(c.env.DB, email)

  // 구슬 보유 확인
  const inv = await c.env.DB.prepare(
    'SELECT count FROM marble_inventory WHERE owner = ? AND marble_type = ?'
  ).bind(email, mType).first<{ count: number }>()
  if ((inv?.count ?? 0) < bet) return c.json({ error: '구슬이 부족합니다' }, 400)

  const roomId = generateRoomId()
  const state: GameState = {
    phase: 'waiting', marbles: [], turnOrder: [], currentTurnIndex: 0,
    roundNumber: 0, maxRounds: 0, arenaRadius: ARENA_RADIUS,
    results: [], lastShot: null,
  }

  await c.env.DB.prepare(
    `INSERT INTO marble_rooms (id, host_email, host_name, max_players, bet_amount, status, state)
     VALUES (?, ?, ?, ?, ?, 'waiting', ?)`
  ).bind(roomId, email, nickname, max, bet, JSON.stringify(state)).run()

  await c.env.DB.prepare(
    `INSERT INTO marble_players (room_id, player_id, nickname, marble_type, is_ai)
     VALUES (?, ?, ?, ?, 0)`
  ).bind(roomId, email, nickname, mType).run()

  return c.json({ roomId })
})

// 방 상태 조회
app.get('/rooms/:roomId', async (c) => {
  const roomId = c.req.param('roomId')
  const room = await c.env.DB.prepare('SELECT * FROM marble_rooms WHERE id = ?').bind(roomId).first()
  if (!room) return c.json({ error: '방을 찾을 수 없습니다' }, 404)

  const players = await c.env.DB.prepare(
    'SELECT player_id, nickname, marble_type, is_ai FROM marble_players WHERE room_id = ? ORDER BY joined_at'
  ).bind(roomId).all()

  const state: GameState = JSON.parse(room.state as string)

  const token = c.req.header('Authorization')?.replace('Bearer ', '')
  let myEmail = ''
  if (token) {
    const { verifyFirebaseToken } = await import('../auth')
    const result = await verifyFirebaseToken(token, c.env.FIREBASE_PROJECT_ID)
    if (result) myEmail = result.email.toLowerCase()
  }

  return c.json({
    id: room.id, hostEmail: room.host_email, hostName: room.host_name,
    maxPlayers: room.max_players, betAmount: room.bet_amount, status: room.status,
    players: players.results ?? [], state, myEmail,
  })
})

// 방 참가
app.post('/rooms/:roomId/join', requireLoggedInUser, async (c) => {
  const roomId = c.req.param('roomId')
  const email = c.get('userEmail')
  const nickname = c.get('userNickname')
  const { marbleType } = await c.req.json<{ marbleType?: string }>()
  const mType = marbleType && MARBLE_TYPES[marbleType] ? marbleType : 'glass'

  const room = await c.env.DB.prepare('SELECT * FROM marble_rooms WHERE id = ?').bind(roomId).first()
  if (!room) return c.json({ error: '방을 찾을 수 없습니다' }, 404)
  if (room.status !== 'waiting') return c.json({ error: '이미 게임이 시작되었습니다' }, 400)

  const count = await c.env.DB.prepare(
    'SELECT COUNT(*) as cnt FROM marble_players WHERE room_id = ?'
  ).bind(roomId).first<{ cnt: number }>()
  if ((count?.cnt ?? 0) >= (room.max_players as number)) return c.json({ error: '방이 가득 찼습니다' }, 400)

  await ensureInventory(c.env.DB, email)

  // 구슬 보유 확인
  const inv = await c.env.DB.prepare(
    'SELECT count FROM marble_inventory WHERE owner = ? AND marble_type = ?'
  ).bind(email, mType).first<{ count: number }>()
  if ((inv?.count ?? 0) < (room.bet_amount as number)) return c.json({ error: '구슬이 부족합니다' }, 400)

  const existing = await c.env.DB.prepare(
    'SELECT id FROM marble_players WHERE room_id = ? AND player_id = ?'
  ).bind(roomId, email).first()
  if (existing) return c.json({ ok: true, message: '이미 참가 중' })

  await c.env.DB.prepare(
    'INSERT INTO marble_players (room_id, player_id, nickname, marble_type, is_ai) VALUES (?, ?, ?, ?, 0)'
  ).bind(roomId, email, nickname, mType).run()

  return c.json({ ok: true })
})

// AI 추가
app.post('/rooms/:roomId/add-ai', requireLoggedInUser, async (c) => {
  const roomId = c.req.param('roomId')
  const email = c.get('userEmail')

  const room = await c.env.DB.prepare('SELECT * FROM marble_rooms WHERE id = ?').bind(roomId).first()
  if (!room) return c.json({ error: '방을 찾을 수 없습니다' }, 404)
  if (room.host_email !== email) return c.json({ error: '방장만 가능합니다' }, 403)
  if (room.status !== 'waiting') return c.json({ error: '이미 시작됨' }, 400)

  const players = await c.env.DB.prepare(
    'SELECT player_id, nickname FROM marble_players WHERE room_id = ?'
  ).bind(roomId).all()
  if ((players.results?.length ?? 0) >= (room.max_players as number))
    return c.json({ error: '방이 가득 찼습니다' }, 400)

  const usedNames = new Set((players.results ?? []).map((p: any) => p.nickname))
  const available = AI_NAMES.filter(n => !usedNames.has(n))
  const aiName = available.length > 0 ? available[Math.floor(Math.random() * available.length)] : `AI_${Date.now()}`
  const aiId = `ai_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`

  // AI 구슬 타입 랜덤
  const aiTypes = ['glass', 'steel', 'glass', 'glass']
  const aiType = aiTypes[Math.floor(Math.random() * aiTypes.length)]

  await c.env.DB.prepare(
    'INSERT INTO marble_players (room_id, player_id, nickname, marble_type, is_ai) VALUES (?, ?, ?, ?, 1)'
  ).bind(roomId, aiId, aiName, aiType).run()

  return c.json({ ok: true, aiId, aiName })
})

// AI 제거
app.delete('/rooms/:roomId/remove-ai/:aiId', requireLoggedInUser, async (c) => {
  const roomId = c.req.param('roomId')
  const aiId = c.req.param('aiId')
  const email = c.get('userEmail')

  const room = await c.env.DB.prepare('SELECT host_email, status FROM marble_rooms WHERE id = ?').bind(roomId).first()
  if (!room) return c.json({ error: '방을 찾을 수 없습니다' }, 404)
  if (room.host_email !== email) return c.json({ error: '방장만 가능합니다' }, 403)
  if (room.status !== 'waiting') return c.json({ error: '이미 시작됨' }, 400)

  await c.env.DB.prepare(
    'DELETE FROM marble_players WHERE room_id = ? AND player_id = ? AND is_ai = 1'
  ).bind(roomId, aiId).run()

  return c.json({ ok: true })
})

// 게임 시작
app.post('/rooms/:roomId/start', requireLoggedInUser, async (c) => {
  const roomId = c.req.param('roomId')
  const email = c.get('userEmail')

  const room = await c.env.DB.prepare('SELECT * FROM marble_rooms WHERE id = ?').bind(roomId).first()
  if (!room) return c.json({ error: '방을 찾을 수 없습니다' }, 404)
  if (room.host_email !== email) return c.json({ error: '방장만 시작할 수 있습니다' }, 403)
  if (room.status !== 'waiting') return c.json({ error: '이미 시작됨' }, 400)

  const players = await c.env.DB.prepare(
    'SELECT player_id, nickname, marble_type, is_ai FROM marble_players WHERE room_id = ? ORDER BY joined_at'
  ).bind(roomId).all()
  const playerList = (players.results ?? []) as { player_id: string; nickname: string; marble_type: string; is_ai: number }[]
  if (playerList.length < 2) return c.json({ error: '최소 2명 필요합니다' }, 400)

  const betAmount = room.bet_amount as number

  // 실제 유저의 구슬 차감
  for (const p of playerList) {
    if (p.is_ai) continue
    await c.env.DB.prepare(
      'UPDATE marble_inventory SET count = count - ? WHERE owner = ? AND marble_type = ? AND count >= ?'
    ).bind(betAmount, p.player_id, p.marble_type, betAmount).run()
  }

  // 구슬 배치
  const marbles: MarbleState[] = []
  for (const p of playerList) {
    const mt = MARBLE_TYPES[p.marble_type] ?? MARBLE_TYPES.glass
    for (let i = 0; i < betAmount; i++) {
      marbles.push({
        id: p.player_id,
        type: p.marble_type,
        pos: randomPosInRing(ARENA_RADIUS, mt.radius),
        vel: { x: 0, y: 0 },
        radius: mt.radius,
        mass: mt.mass,
        restitution: mt.restitution,
        eliminated: false,
      })
    }
  }

  // 턴 순서 랜덤
  const turnOrder = playerList.map(p => p.player_id).sort(() => Math.random() - 0.5)
  const maxRounds = betAmount * playerList.length * 3 // 최대 라운드

  const state: GameState = {
    phase: 'aiming',
    marbles,
    turnOrder,
    currentTurnIndex: 0,
    roundNumber: 1,
    maxRounds,
    arenaRadius: ARENA_RADIUS,
    results: [],
    lastShot: null,
  }

  await c.env.DB.prepare(
    `UPDATE marble_rooms SET status = 'playing', state = ?, updated_at = datetime('now') WHERE id = ?`
  ).bind(JSON.stringify(state), roomId).run()

  // AI 턴이면 자동 처리
  await processAiTurn(c.env.DB, roomId, state, playerList)

  return c.json({ ok: true })
})

// 슈팅 (조준 후 발사)
app.post('/rooms/:roomId/shoot', requireLoggedInUser, async (c) => {
  const roomId = c.req.param('roomId')
  const email = c.get('userEmail')
  const { angle, power } = await c.req.json<{ angle: number; power: number }>()

  const room = await c.env.DB.prepare('SELECT * FROM marble_rooms WHERE id = ?').bind(roomId).first()
  if (!room) return c.json({ error: '방을 찾을 수 없습니다' }, 404)

  const state: GameState = JSON.parse(room.state as string)
  if (state.phase !== 'aiming') return c.json({ error: '지금은 쏠 수 없습니다' }, 400)

  const currentPlayer = state.turnOrder[state.currentTurnIndex]
  if (currentPlayer !== email) return c.json({ error: '당신의 턴이 아닙니다' }, 400)

  const clampedPower = Math.min(Math.max(power, 0.1), 1.0)

  // 슈터 구슬 찾기 (해당 플레이어의 첫 번째 살아있는 구슬)
  const shooterIdx = state.marbles.findIndex(m => m.id === email && !m.eliminated)
  if (shooterIdx < 0) return c.json({ error: '쏠 구슬이 없습니다' }, 400)

  // 발사 속도 적용
  const maxSpeed = 18
  const speed = clampedPower * maxSpeed
  state.marbles[shooterIdx].vel = {
    x: Math.cos(angle) * speed,
    y: Math.sin(angle) * speed,
  }

  state.lastShot = { playerId: email, angle, power: clampedPower }
  state.phase = 'simulating'

  // 서버에서 물리 시뮬레이션 (결과 계산)
  simulatePhysics(state)

  // 탈락 판정 (원 밖으로 나간 구슬)
  for (const m of state.marbles) {
    if (m.eliminated) continue
    const dist = Math.sqrt(m.pos.x * m.pos.x + m.pos.y * m.pos.y)
    if (dist + m.radius > state.arenaRadius) {
      m.eliminated = true
    }
  }

  // 게임 종료 체크
  const remainingPlayers = new Set(
    state.marbles.filter(m => !m.eliminated).map(m => m.id)
  )

  if (remainingPlayers.size <= 1 || state.roundNumber >= state.maxRounds) {
    // 게임 종료
    state.phase = 'finished'
    // 결과 계산: 남은 구슬 수 기준 순위
    const playerMarbleCount: Record<string, number> = {}
    for (const pid of state.turnOrder) playerMarbleCount[pid] = 0
    for (const m of state.marbles) {
      if (!m.eliminated) playerMarbleCount[m.id] = (playerMarbleCount[m.id] ?? 0) + 1
    }
    const sorted = Object.entries(playerMarbleCount).sort((a, b) => b[1] - a[1])
    state.results = sorted.map(([pid, cnt], i) => ({
      playerId: pid, eliminated: cnt === 0, rank: i + 1,
    }))

    // 보상 분배: 1등이 모든 배팅 구슬 획득
    const betAmount = room.bet_amount as number
    const players = await c.env.DB.prepare(
      'SELECT player_id, marble_type, is_ai FROM marble_players WHERE room_id = ?'
    ).bind(roomId).all()
    const playerList = (players.results ?? []) as { player_id: string; marble_type: string; is_ai: number }[]
    const winnerId = sorted[0]?.[0]
    if (winnerId) {
      const winnerPlayer = playerList.find(p => p.player_id === winnerId)
      if (winnerPlayer && !winnerPlayer.is_ai) {
        // 승자에게 총 배팅 구슬 지급 (자기 것 포함 모든 참가자의 배팅)
        const totalWin = betAmount * playerList.length
        await c.env.DB.prepare(
          `INSERT INTO marble_inventory (owner, marble_type, count) VALUES (?, ?, ?)
           ON CONFLICT(owner, marble_type) DO UPDATE SET count = count + ?`
        ).bind(winnerId, winnerPlayer.marble_type, totalWin, totalWin).run()
      }
    }

    await c.env.DB.prepare(
      `UPDATE marble_rooms SET status = 'finished', state = ?, updated_at = datetime('now') WHERE id = ?`
    ).bind(JSON.stringify(state), roomId).run()

    return c.json({ ok: true, finished: true, results: state.results })
  }

  // 다음 턴
  advanceToNextPlayer(state)
  state.phase = 'aiming'

  await c.env.DB.prepare(
    `UPDATE marble_rooms SET state = ?, updated_at = datetime('now') WHERE id = ?`
  ).bind(JSON.stringify(state), roomId).run()

  // AI 턴 처리
  const players = await c.env.DB.prepare(
    'SELECT player_id, nickname, marble_type, is_ai FROM marble_players WHERE room_id = ?'
  ).bind(roomId).all()
  await processAiTurn(c.env.DB, roomId, state, (players.results ?? []) as any)

  return c.json({ ok: true })
})

// 방 나가기
app.post('/rooms/:roomId/leave', requireLoggedInUser, async (c) => {
  const roomId = c.req.param('roomId')
  const email = c.get('userEmail')

  const room = await c.env.DB.prepare('SELECT * FROM marble_rooms WHERE id = ?').bind(roomId).first()
  if (!room) return c.json({ error: '방을 찾을 수 없습니다' }, 404)

  if (room.status === 'waiting') {
    await c.env.DB.prepare('DELETE FROM marble_players WHERE room_id = ? AND player_id = ?').bind(roomId, email).run()
    if (room.host_email === email) {
      await c.env.DB.prepare('DELETE FROM marble_players WHERE room_id = ?').bind(roomId).run()
      await c.env.DB.prepare('DELETE FROM marble_rooms WHERE id = ?').bind(roomId).run()
    }
  }
  return c.json({ ok: true })
})

// 랭킹 (구슬 총 보유량)
app.get('/ranking', async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT owner, SUM(
       CASE marble_type
         WHEN 'glass' THEN count * 1
         WHEN 'steel' THEN count * 3
         WHEN 'king' THEN count * 5
         WHEN 'ruby' THEN count * 10
         WHEN 'emerald' THEN count * 10
         WHEN 'rainbow' THEN count * 25
         ELSE count
       END
     ) as score,
     SUM(count) as total_marbles
     FROM marble_inventory
     GROUP BY owner
     ORDER BY score DESC
     LIMIT 20`
  ).all()

  // 닉네임 매핑
  const results = []
  for (const row of (rows.results ?? []) as any[]) {
    const userRow = await c.env.DB.prepare(
      `SELECT nickname FROM users WHERE LOWER(email) = ?
       UNION SELECT nickname FROM admin_nicknames WHERE LOWER(email) = ?`
    ).bind(row.owner, row.owner).first<{ nickname: string }>()
    results.push({
      nickname: userRow?.nickname ?? row.owner.split('@')[0],
      score: row.score,
      totalMarbles: row.total_marbles,
    })
  }

  return c.json(results)
})

// ─── 헬퍼 함수 ───

function simulatePhysics(state: GameState) {
  const dt = 1 / 60
  const friction = 0.985
  const steps = 300 // 5초 시뮬레이션 (60fps * 5s)

  for (let step = 0; step < steps; step++) {
    let anyMoving = false

    for (const m of state.marbles) {
      if (m.eliminated) continue

      // 속도 업데이트 (마찰)
      m.vel.x *= friction
      m.vel.y *= friction

      // 위치 업데이트
      m.pos.x += m.vel.x
      m.pos.y += m.vel.y

      // 속도 threshold
      const speed = Math.sqrt(m.vel.x * m.vel.x + m.vel.y * m.vel.y)
      if (speed > 0.05) anyMoving = true
      if (speed < 0.05) { m.vel.x = 0; m.vel.y = 0 }
    }

    // 구슬 간 충돌
    const active = state.marbles.filter(m => !m.eliminated)
    for (let i = 0; i < active.length; i++) {
      for (let j = i + 1; j < active.length; j++) {
        resolveCollision(active[i], active[j])
      }
    }

    if (!anyMoving && step > 10) break
  }

  // 최종 속도 0으로
  for (const m of state.marbles) {
    m.vel.x = 0
    m.vel.y = 0
  }
}

function resolveCollision(a: MarbleState, b: MarbleState) {
  const dx = b.pos.x - a.pos.x
  const dy = b.pos.y - a.pos.y
  const dist = Math.sqrt(dx * dx + dy * dy)
  const minDist = a.radius + b.radius

  if (dist >= minDist || dist === 0) return

  // 법선 벡터
  const nx = dx / dist
  const ny = dy / dist

  // 겹침 해소
  const overlap = minDist - dist
  const totalMass = a.mass + b.mass
  a.pos.x -= nx * overlap * (b.mass / totalMass)
  a.pos.y -= ny * overlap * (b.mass / totalMass)
  b.pos.x += nx * overlap * (a.mass / totalMass)
  b.pos.y += ny * overlap * (a.mass / totalMass)

  // 상대 속도
  const dvx = a.vel.x - b.vel.x
  const dvy = a.vel.y - b.vel.y
  const dvDotN = dvx * nx + dvy * ny

  if (dvDotN <= 0) return // 이미 멀어지는 중

  const restitution = Math.min(a.restitution, b.restitution)
  const impulse = (1 + restitution) * dvDotN / totalMass

  a.vel.x -= impulse * b.mass * nx
  a.vel.y -= impulse * b.mass * ny
  b.vel.x += impulse * a.mass * nx
  b.vel.y += impulse * a.mass * ny
}

function advanceToNextPlayer(state: GameState) {
  const len = state.turnOrder.length
  for (let i = 1; i <= len; i++) {
    const idx = (state.currentTurnIndex + i) % len
    const pid = state.turnOrder[idx]
    const hasMarbles = state.marbles.some(m => m.id === pid && !m.eliminated)
    if (hasMarbles) {
      state.currentTurnIndex = idx
      if (idx <= state.currentTurnIndex) state.roundNumber++
      return
    }
  }
  // 아무도 남지 않음
  state.phase = 'finished'
}

async function processAiTurn(
  db: D1Database, roomId: string, state: GameState,
  playerList: { player_id: string; is_ai: number }[]
) {
  const aiIds = new Set(playerList.filter(p => p.is_ai === 1).map(p => p.player_id))

  for (let iter = 0; iter < 20; iter++) {
    if (state.phase !== 'aiming') break
    const currentPlayer = state.turnOrder[state.currentTurnIndex]
    if (!aiIds.has(currentPlayer)) break

    // AI 전략: 가장 가까운 상대 구슬을 조준
    const myMarble = state.marbles.find(m => m.id === currentPlayer && !m.eliminated)
    if (!myMarble) break

    const enemies = state.marbles.filter(m => m.id !== currentPlayer && !m.eliminated)
    if (enemies.length === 0) break

    // 가장 가까운 적 구슬
    let closest = enemies[0]
    let closestDist = Infinity
    for (const e of enemies) {
      const dx = e.pos.x - myMarble.pos.x
      const dy = e.pos.y - myMarble.pos.y
      const d = Math.sqrt(dx * dx + dy * dy)
      if (d < closestDist) { closestDist = d; closest = e }
    }

    const dx = closest.pos.x - myMarble.pos.x
    const dy = closest.pos.y - myMarble.pos.y
    const angle = Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.3 // 약간의 오차
    const power = 0.5 + Math.random() * 0.4

    // 발사
    const maxSpeed = 18
    const speed = power * maxSpeed
    myMarble.vel = { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed }
    state.lastShot = { playerId: currentPlayer, angle, power }

    // 시뮬레이션
    simulatePhysics(state)

    // 탈락 판정
    for (const m of state.marbles) {
      if (m.eliminated) continue
      const dist = Math.sqrt(m.pos.x * m.pos.x + m.pos.y * m.pos.y)
      if (dist + m.radius > state.arenaRadius) m.eliminated = true
    }

    // 종료 체크
    const remaining = new Set(state.marbles.filter(m => !m.eliminated).map(m => m.id))
    if (remaining.size <= 1 || state.roundNumber >= state.maxRounds) {
      state.phase = 'finished'
      const playerMarbleCount: Record<string, number> = {}
      for (const pid of state.turnOrder) playerMarbleCount[pid] = 0
      for (const m of state.marbles) {
        if (!m.eliminated) playerMarbleCount[m.id] = (playerMarbleCount[m.id] ?? 0) + 1
      }
      const sorted = Object.entries(playerMarbleCount).sort((a, b) => b[1] - a[1])
      state.results = sorted.map(([pid, cnt], i) => ({
        playerId: pid, eliminated: cnt === 0, rank: i + 1,
      }))

      // 보상
      const room = await db.prepare('SELECT bet_amount FROM marble_rooms WHERE id = ?').bind(roomId).first()
      const betAmount = (room?.bet_amount as number) ?? 1
      const winnerId = sorted[0]?.[0]
      if (winnerId) {
        const winnerP = playerList.find(p => p.player_id === winnerId)
        if (winnerP && !winnerP.is_ai) {
          const totalWin = betAmount * playerList.length
          const wType = (await db.prepare(
            'SELECT marble_type FROM marble_players WHERE room_id = ? AND player_id = ?'
          ).bind(roomId, winnerId).first<{ marble_type: string }>())?.marble_type ?? 'glass'
          await db.prepare(
            `INSERT INTO marble_inventory (owner, marble_type, count) VALUES (?, ?, ?)
             ON CONFLICT(owner, marble_type) DO UPDATE SET count = count + ?`
          ).bind(winnerId, wType, totalWin, totalWin).run()
        }
      }

      await db.prepare(
        `UPDATE marble_rooms SET status = 'finished', state = ?, updated_at = datetime('now') WHERE id = ?`
      ).bind(JSON.stringify(state), roomId).run()
      return
    }

    // 다음 턴
    advanceToNextPlayer(state)
    state.phase = 'aiming'
  }

  // 상태 저장
  const newStatus = state.phase === 'finished' ? 'finished' : 'playing'
  await db.prepare(
    `UPDATE marble_rooms SET status = ?, state = ?, updated_at = datetime('now') WHERE id = ?`
  ).bind(newStatus, JSON.stringify(state), roomId).run()
}

export default app
