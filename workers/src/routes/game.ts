import { Hono } from 'hono'
import type { Env, Variables } from '../types'
import { requireLoggedInUser } from '../middleware/user'

const app = new Hono<{ Bindings: Env; Variables: Variables }>()

// ─── 카드 유틸 ───

// 카드: 1~25 각 2장(50장) + 조커(0) = 51장
function createDeck(): number[] {
  const deck: number[] = [0] // 조커 (도둑)
  for (let i = 1; i <= 25; i++) {
    deck.push(i, i)
  }
  return shuffle(deck)
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// 핸드에서 페어 제거 (초기 배분 시에만 사용)
function removePairs(hand: number[]): { hand: number[]; removed: number[] } {
  const counts = new Map<number, number>()
  for (const c of hand) counts.set(c, (counts.get(c) ?? 0) + 1)
  const removed: number[] = []
  const result: number[] = []
  for (const [card, count] of counts) {
    if (count >= 2) {
      removed.push(card)
      if (count % 2 === 1) result.push(card)
    } else {
      result.push(card)
    }
  }
  return { hand: result, removed }
}

// 핸드에 페어가 있는지 확인
function hasPair(hand: number[]): boolean {
  const counts = new Map<number, number>()
  for (const c of hand) {
    if (c === 0) continue // 조커는 페어 불가
    const cnt = (counts.get(c) ?? 0) + 1
    counts.set(c, cnt)
    if (cnt >= 2) return true
  }
  return false
}

interface GameState {
  hands: Record<string, number[]>
  turnOrder: string[]
  currentTurnIndex: number
  eliminatedPlayers: string[]
  lastAction: {
    type: string // 'draw' | 'discard' | 'pass'
    player: string
    from?: string
    cardPosition?: number
    drawnCard?: number
    discardedCard?: number
  } | null
  phase: 'waiting' | 'playing' | 'finished'
  turnPhase: 'draw' | 'discard' | null // 턴 내 단계
  loser: string | null
}

function generateRoomId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let id = ''
  for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)]
  return id
}

const AI_NAMES = [
  '흑기사', '백마법사', '불사조', '얼음여왕', '그림자',
  '천둥번개', '달빛검사', '바람도적', '별의수호자', '황금용',
  '은빛늑대', '붉은독수리', '푸른바다', '녹색숲', '보라안개',
]

// ─── API 엔드포인트 ───

// 방 목록
app.get('/', async (c) => {
  // 1시간 이상 된 finished 방, 3시간 이상 된 모든 방 자동 정리
  await c.env.DB.prepare(
    `DELETE FROM game_players WHERE room_id IN (
       SELECT id FROM game_rooms WHERE
         (status = 'finished' AND updated_at < datetime('now', '-1 hour'))
         OR updated_at < datetime('now', '-3 hours')
     )`
  ).run()
  await c.env.DB.prepare(
    `DELETE FROM game_rooms WHERE
       (status = 'finished' AND updated_at < datetime('now', '-1 hour'))
       OR updated_at < datetime('now', '-3 hours')`
  ).run()

  const rooms = await c.env.DB.prepare(
    `SELECT r.id, r.host_email, r.host_name, r.max_players, r.status, r.created_at,
            (SELECT COUNT(*) FROM game_players WHERE room_id = r.id) as player_count
     FROM game_rooms r
     WHERE r.status IN ('waiting', 'playing')
     ORDER BY r.created_at DESC
     LIMIT 20`
  ).all()
  return c.json(rooms.results ?? [])
})

// 방 생성
app.post('/', requireLoggedInUser, async (c) => {
  const email = c.get('userEmail')
  const nickname = c.get('userNickname')
  const { maxPlayers } = await c.req.json<{ maxPlayers?: number }>()
  const max = Math.min(Math.max(maxPlayers ?? 10, 3), 10)
  const roomId = generateRoomId()

  const state: GameState = {
    hands: {}, turnOrder: [], currentTurnIndex: 0,
    eliminatedPlayers: [], lastAction: null,
    phase: 'waiting', turnPhase: null, loser: null,
  }

  await c.env.DB.prepare(
    `INSERT INTO game_rooms (id, host_email, host_name, max_players, status, state)
     VALUES (?, ?, ?, ?, 'waiting', ?)`
  ).bind(roomId, email, nickname, max, JSON.stringify(state)).run()

  await c.env.DB.prepare(
    `INSERT INTO game_players (room_id, player_id, nickname, is_ai) VALUES (?, ?, ?, 0)`
  ).bind(roomId, email, nickname).run()

  return c.json({ roomId })
})

// 방 상태 조회
app.get('/:roomId', async (c) => {
  const roomId = c.req.param('roomId')

  const room = await c.env.DB.prepare(
    'SELECT * FROM game_rooms WHERE id = ?'
  ).bind(roomId).first()
  if (!room) return c.json({ error: '방을 찾을 수 없습니다' }, 404)

  const players = await c.env.DB.prepare(
    'SELECT player_id, nickname, is_ai FROM game_players WHERE room_id = ? ORDER BY joined_at'
  ).bind(roomId).all()

  const state: GameState = JSON.parse(room.state as string)

  const token = c.req.header('Authorization')?.replace('Bearer ', '')
  let myEmail = ''
  if (token) {
    const { verifyFirebaseToken } = await import('../auth')
    const result = await verifyFirebaseToken(token, c.env.FIREBASE_PROJECT_ID)
    if (result) myEmail = result.email.toLowerCase()
  }

  // 보안: 다른 플레이어의 카드는 장수만 공개
  const publicState: Record<string, unknown> = {
    phase: state.phase,
    turnPhase: state.turnPhase,
    turnOrder: state.turnOrder,
    currentTurnIndex: state.currentTurnIndex,
    eliminatedPlayers: state.eliminatedPlayers,
    lastAction: state.lastAction,
    loser: state.loser,
    myHand: state.hands[myEmail] ?? [],
    handCounts: {} as Record<string, number>,
  }

  for (const [pid, hand] of Object.entries(state.hands)) {
    (publicState.handCounts as Record<string, number>)[pid] = hand.length
  }

  return c.json({
    id: room.id, hostEmail: room.host_email, hostName: room.host_name,
    maxPlayers: room.max_players, status: room.status,
    players: players.results ?? [], state: publicState, myEmail,
  })
})

// 방 참가
app.post('/:roomId/join', requireLoggedInUser, async (c) => {
  const roomId = c.req.param('roomId')
  const email = c.get('userEmail')
  const nickname = c.get('userNickname')

  const room = await c.env.DB.prepare('SELECT * FROM game_rooms WHERE id = ?').bind(roomId).first()
  if (!room) return c.json({ error: '방을 찾을 수 없습니다' }, 404)
  if (room.status !== 'waiting') return c.json({ error: '이미 게임이 시작되었습니다' }, 400)

  const count = await c.env.DB.prepare(
    'SELECT COUNT(*) as cnt FROM game_players WHERE room_id = ?'
  ).bind(roomId).first<{ cnt: number }>()
  if ((count?.cnt ?? 0) >= (room.max_players as number)) return c.json({ error: '방이 가득 찼습니다' }, 400)

  const existing = await c.env.DB.prepare(
    'SELECT id FROM game_players WHERE room_id = ? AND player_id = ?'
  ).bind(roomId, email).first()
  if (existing) return c.json({ ok: true, message: '이미 참가 중' })

  await c.env.DB.prepare(
    'INSERT INTO game_players (room_id, player_id, nickname, is_ai) VALUES (?, ?, ?, 0)'
  ).bind(roomId, email, nickname).run()

  return c.json({ ok: true })
})

// AI 추가 (호스트만)
app.post('/:roomId/add-ai', requireLoggedInUser, async (c) => {
  const roomId = c.req.param('roomId')
  const email = c.get('userEmail')

  const room = await c.env.DB.prepare('SELECT * FROM game_rooms WHERE id = ?').bind(roomId).first()
  if (!room) return c.json({ error: '방을 찾을 수 없습니다' }, 404)
  if (room.host_email !== email) return c.json({ error: '방장만 AI를 추가할 수 있습니다' }, 403)
  if (room.status !== 'waiting') return c.json({ error: '이미 게임이 시작되었습니다' }, 400)

  const players = await c.env.DB.prepare(
    'SELECT player_id, nickname FROM game_players WHERE room_id = ?'
  ).bind(roomId).all()
  const count = players.results?.length ?? 0
  if (count >= (room.max_players as number)) return c.json({ error: '방이 가득 찼습니다' }, 400)

  const usedNames = new Set((players.results ?? []).map((p: any) => p.nickname))
  const availableNames = AI_NAMES.filter(n => !usedNames.has(n))
  const aiName = availableNames.length > 0
    ? availableNames[Math.floor(Math.random() * availableNames.length)]
    : `AI_${count + 1}`
  const aiId = `ai_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`

  await c.env.DB.prepare(
    'INSERT INTO game_players (room_id, player_id, nickname, is_ai) VALUES (?, ?, ?, 1)'
  ).bind(roomId, aiId, aiName).run()

  return c.json({ ok: true, aiId, aiName })
})

// AI 제거 (호스트만)
app.delete('/:roomId/remove-ai/:aiId', requireLoggedInUser, async (c) => {
  const roomId = c.req.param('roomId')
  const aiId = c.req.param('aiId')
  const email = c.get('userEmail')

  const room = await c.env.DB.prepare('SELECT host_email, status FROM game_rooms WHERE id = ?').bind(roomId).first()
  if (!room) return c.json({ error: '방을 찾을 수 없습니다' }, 404)
  if (room.host_email !== email) return c.json({ error: '방장만 가능합니다' }, 403)
  if (room.status !== 'waiting') return c.json({ error: '이미 게임이 시작됨' }, 400)

  await c.env.DB.prepare(
    'DELETE FROM game_players WHERE room_id = ? AND player_id = ? AND is_ai = 1'
  ).bind(roomId, aiId).run()

  return c.json({ ok: true })
})

// 게임 시작 (호스트만)
app.post('/:roomId/start', requireLoggedInUser, async (c) => {
  const roomId = c.req.param('roomId')
  const email = c.get('userEmail')

  const room = await c.env.DB.prepare('SELECT * FROM game_rooms WHERE id = ?').bind(roomId).first()
  if (!room) return c.json({ error: '방을 찾을 수 없습니다' }, 404)
  if (room.host_email !== email) return c.json({ error: '방장만 시작할 수 있습니다' }, 403)
  if (room.status !== 'waiting') return c.json({ error: '이미 시작됨' }, 400)

  const players = await c.env.DB.prepare(
    'SELECT player_id, nickname, is_ai FROM game_players WHERE room_id = ? ORDER BY joined_at'
  ).bind(roomId).all()
  const playerList = (players.results ?? []) as { player_id: string; nickname: string; is_ai: number }[]
  if (playerList.length < 3) return c.json({ error: '최소 3명 필요합니다' }, 400)

  // 카드 생성 & 배분
  const deck = createDeck()
  const hands: Record<string, number[]> = {}
  const turnOrder = shuffle(playerList.map(p => p.player_id))

  for (const pid of turnOrder) hands[pid] = []
  for (let i = 0; i < deck.length; i++) {
    hands[turnOrder[i % turnOrder.length]].push(deck[i])
  }

  // 초기 페어 제거 (게임 시작 시에만 자동)
  for (const pid of turnOrder) {
    const result = removePairs(hands[pid])
    hands[pid] = shuffle(result.hand)
  }

  const eliminated: string[] = []
  for (const pid of turnOrder) {
    if (hands[pid].length === 0) eliminated.push(pid)
  }

  const state: GameState = {
    hands, turnOrder, currentTurnIndex: 0,
    eliminatedPlayers: eliminated, lastAction: null,
    phase: 'playing', turnPhase: 'draw', loser: null,
  }

  advanceToNextActivePlayer(state)

  await c.env.DB.prepare(
    `UPDATE game_rooms SET status = 'playing', state = ?, updated_at = datetime('now') WHERE id = ?`
  ).bind(JSON.stringify(state), roomId).run()

  // AI 턴이면 자동 처리
  await processAiTurns(c.env.DB, roomId, state, playerList)

  return c.json({ ok: true })
})

// 카드 뽑기 (draw 페이즈에서만)
app.post('/:roomId/draw', requireLoggedInUser, async (c) => {
  const roomId = c.req.param('roomId')
  const email = c.get('userEmail')
  const { position } = await c.req.json<{ position: number }>()

  const room = await c.env.DB.prepare('SELECT * FROM game_rooms WHERE id = ?').bind(roomId).first()
  if (!room) return c.json({ error: '방을 찾을 수 없습니다' }, 404)
  if (room.status !== 'playing') return c.json({ error: '게임 중이 아닙니다' }, 400)

  const state: GameState = JSON.parse(room.state as string)
  if (state.phase !== 'playing') return c.json({ error: '게임이 끝났습니다' }, 400)
  if (state.turnPhase !== 'draw') return c.json({ error: '지금은 카드를 뽑을 수 없습니다 (페어를 버려주세요)' }, 400)

  const currentPlayer = state.turnOrder[state.currentTurnIndex]
  if (currentPlayer !== email) return c.json({ error: '당신의 턴이 아닙니다' }, 400)

  const targetId = findNextActivePlayer(state, state.currentTurnIndex)
  if (!targetId) return c.json({ error: '뽑을 대상이 없습니다' }, 400)

  const targetHand = state.hands[targetId]
  if (position < 0 || position >= targetHand.length) {
    return c.json({ error: '잘못된 카드 위치입니다' }, 400)
  }

  // 카드 뽑기 (페어 자동 제거 안 함!)
  const drawnCard = targetHand.splice(position, 1)[0]
  state.hands[email].push(drawnCard)

  state.lastAction = {
    type: 'draw', player: email, from: targetId,
    cardPosition: position, drawnCard,
  }

  // 대상이 카드 0장이면 탈출
  if (state.hands[targetId].length === 0 && !state.eliminatedPlayers.includes(targetId)) {
    state.eliminatedPlayers.push(targetId)
  }

  // 내 핸드에 페어가 있으면 discard 페이즈로 전환
  if (hasPair(state.hands[email])) {
    state.turnPhase = 'discard'
  } else {
    // 페어 없으면 바로 턴 종료
    finishTurn(state)
  }

  await c.env.DB.prepare(
    `UPDATE game_rooms SET state = ?, updated_at = datetime('now') WHERE id = ?`
  ).bind(JSON.stringify(state), roomId).run()

  // 턴이 넘어갔으면 AI 처리
  if (state.turnPhase === 'draw') {
    const players = await c.env.DB.prepare(
      'SELECT player_id, nickname, is_ai FROM game_players WHERE room_id = ?'
    ).bind(roomId).all()
    await processAiTurns(c.env.DB, roomId, state, (players.results ?? []) as any)
  }

  return c.json({ ok: true })
})

// 페어 버리기 (discard 페이즈에서만)
app.post('/:roomId/discard', requireLoggedInUser, async (c) => {
  const roomId = c.req.param('roomId')
  const email = c.get('userEmail')
  const { card } = await c.req.json<{ card: number }>() // 버릴 카드 번호

  const room = await c.env.DB.prepare('SELECT * FROM game_rooms WHERE id = ?').bind(roomId).first()
  if (!room) return c.json({ error: '방을 찾을 수 없습니다' }, 404)

  const state: GameState = JSON.parse(room.state as string)
  if (state.phase !== 'playing') return c.json({ error: '게임이 끝났습니다' }, 400)
  if (state.turnPhase !== 'discard') return c.json({ error: '지금은 버릴 수 없습니다' }, 400)

  const currentPlayer = state.turnOrder[state.currentTurnIndex]
  if (currentPlayer !== email) return c.json({ error: '당신의 턴이 아닙니다' }, 400)

  if (card === 0) return c.json({ error: '조커는 버릴 수 없습니다' }, 400)

  const myHand = state.hands[email]
  const count = myHand.filter(c => c === card).length
  if (count < 2) return c.json({ error: '페어가 아닙니다 (같은 카드가 2장 필요합니다)' }, 400)

  // 페어 제거 (2장만 제거)
  let removed = 0
  state.hands[email] = myHand.filter(c => {
    if (c === card && removed < 2) { removed++; return false }
    return true
  })

  state.lastAction = { type: 'discard', player: email, discardedCard: card }

  // 카드 0장이면 탈출
  if (state.hands[email].length === 0 && !state.eliminatedPlayers.includes(email)) {
    state.eliminatedPlayers.push(email)
  }

  // 게임 종료 체크
  const activePlayers = state.turnOrder.filter(
    p => !state.eliminatedPlayers.includes(p) && state.hands[p].length > 0
  )
  if (activePlayers.length <= 1) {
    state.phase = 'finished'
    state.loser = activePlayers[0] ?? null
    state.turnPhase = null
    await c.env.DB.prepare(
      `UPDATE game_rooms SET status = 'finished', state = ?, updated_at = datetime('now') WHERE id = ?`
    ).bind(JSON.stringify(state), roomId).run()
    return c.json({ ok: true, finished: true, loser: state.loser })
  }

  // 아직 페어가 남아있으면 계속 discard, 없으면 턴 종료
  if (hasPair(state.hands[email])) {
    state.turnPhase = 'discard'
  } else {
    finishTurn(state)
  }

  await c.env.DB.prepare(
    `UPDATE game_rooms SET state = ?, updated_at = datetime('now') WHERE id = ?`
  ).bind(JSON.stringify(state), roomId).run()

  // 턴이 넘어갔으면 AI 처리
  if ((state.turnPhase as string) === 'draw') {
    const players = await c.env.DB.prepare(
      'SELECT player_id, nickname, is_ai FROM game_players WHERE room_id = ?'
    ).bind(roomId).all()
    await processAiTurns(c.env.DB, roomId, state, (players.results ?? []) as any)
  }

  return c.json({ ok: true })
})

// 패스 (페어 없을 때 턴 종료)
app.post('/:roomId/pass', requireLoggedInUser, async (c) => {
  const roomId = c.req.param('roomId')
  const email = c.get('userEmail')

  const room = await c.env.DB.prepare('SELECT * FROM game_rooms WHERE id = ?').bind(roomId).first()
  if (!room) return c.json({ error: '방을 찾을 수 없습니다' }, 404)

  const state: GameState = JSON.parse(room.state as string)
  if (state.phase !== 'playing') return c.json({ error: '게임이 끝났습니다' }, 400)
  if (state.turnPhase !== 'discard') return c.json({ error: '지금은 패스할 수 없습니다' }, 400)

  const currentPlayer = state.turnOrder[state.currentTurnIndex]
  if (currentPlayer !== email) return c.json({ error: '당신의 턴이 아닙니다' }, 400)

  state.lastAction = { type: 'pass', player: email }
  finishTurn(state)

  await c.env.DB.prepare(
    `UPDATE game_rooms SET state = ?, updated_at = datetime('now') WHERE id = ?`
  ).bind(JSON.stringify(state), roomId).run()

  // AI 처리
  const players = await c.env.DB.prepare(
    'SELECT player_id, nickname, is_ai FROM game_players WHERE room_id = ?'
  ).bind(roomId).all()
  await processAiTurns(c.env.DB, roomId, state, (players.results ?? []) as any)

  return c.json({ ok: true })
})

// 방 나가기
app.post('/:roomId/leave', requireLoggedInUser, async (c) => {
  const roomId = c.req.param('roomId')
  const email = c.get('userEmail')

  const room = await c.env.DB.prepare('SELECT * FROM game_rooms WHERE id = ?').bind(roomId).first()
  if (!room) return c.json({ error: '방을 찾을 수 없습니다' }, 404)

  if (room.status === 'waiting') {
    await c.env.DB.prepare('DELETE FROM game_players WHERE room_id = ? AND player_id = ?').bind(roomId, email).run()
    if (room.host_email === email) {
      await c.env.DB.prepare('DELETE FROM game_players WHERE room_id = ?').bind(roomId).run()
      await c.env.DB.prepare('DELETE FROM game_rooms WHERE id = ?').bind(roomId).run()
    }
  } else if (room.status === 'playing') {
    // 게임 중 이탈: 해당 플레이어의 카드를 덱에서 제거하고 탈락 처리
    const state: GameState = JSON.parse(room.state as string)
    if (!state.eliminatedPlayers.includes(email) && state.hands[email]) {
      // 카드 제거 (조커가 있으면 다음 활성 플레이어에게 전달)
      const jokerIdx = state.hands[email].indexOf(0)
      if (jokerIdx >= 0) {
        const nextActive = findNextActivePlayer(state, state.currentTurnIndex)
        if (nextActive && nextActive !== email) {
          state.hands[nextActive].push(0)
          state.hands[nextActive] = shuffle(state.hands[nextActive])
        }
      }
      state.hands[email] = []
      state.eliminatedPlayers.push(email)

      // 현재 턴이 이탈 플레이어의 턴이면 다음으로 넘김
      if (state.turnOrder[state.currentTurnIndex] === email) {
        finishTurn(state)
      }

      // 게임 종료 체크
      const activePlayers = state.turnOrder.filter(
        p => !state.eliminatedPlayers.includes(p) && state.hands[p].length > 0
      )
      if (activePlayers.length <= 1) {
        state.phase = 'finished'
        state.loser = activePlayers[0] ?? null
        state.turnPhase = null
      }

      const newStatus = state.phase === 'finished' ? 'finished' : 'playing'
      await c.env.DB.prepare(
        `UPDATE game_rooms SET status = ?, state = ?, updated_at = datetime('now') WHERE id = ?`
      ).bind(newStatus, JSON.stringify(state), roomId).run()

      // AI 턴 처리
      if (state.phase === 'playing') {
        const players = await c.env.DB.prepare(
          'SELECT player_id, nickname, is_ai FROM game_players WHERE room_id = ?'
        ).bind(roomId).all()
        await processAiTurns(c.env.DB, roomId, state, (players.results ?? []) as any)
      }
    }
  }
  return c.json({ ok: true })
})

// 방 삭제
app.delete('/:roomId', requireLoggedInUser, async (c) => {
  const roomId = c.req.param('roomId')
  const email = c.get('userEmail')

  const room = await c.env.DB.prepare('SELECT host_email FROM game_rooms WHERE id = ?').bind(roomId).first()
  if (!room) return c.json({ error: '방을 찾을 수 없습니다' }, 404)
  if (room.host_email !== email) return c.json({ error: '방장만 가능합니다' }, 403)

  await c.env.DB.prepare('DELETE FROM game_players WHERE room_id = ?').bind(roomId).run()
  await c.env.DB.prepare('DELETE FROM game_rooms WHERE id = ?').bind(roomId).run()
  return c.json({ ok: true })
})

// ─── 헬퍼 함수 ───

function findNextActivePlayer(state: GameState, fromIndex: number): string | null {
  const len = state.turnOrder.length
  for (let i = 1; i < len; i++) {
    const idx = (fromIndex + i) % len
    const pid = state.turnOrder[idx]
    if (!state.eliminatedPlayers.includes(pid) && state.hands[pid]?.length > 0) return pid
  }
  return null
}

function advanceToNextActivePlayer(state: GameState) {
  const len = state.turnOrder.length
  for (let i = 0; i < len; i++) {
    const pid = state.turnOrder[state.currentTurnIndex]
    if (!state.eliminatedPlayers.includes(pid) && state.hands[pid]?.length > 0) return true
    state.currentTurnIndex = (state.currentTurnIndex + 1) % len
  }
  // 활성 플레이어를 찾지 못함 — 게임 종료 처리
  const remaining = state.turnOrder.filter(
    p => !state.eliminatedPlayers.includes(p) && state.hands[p]?.length > 0
  )
  state.phase = 'finished'
  state.loser = remaining[0] ?? null
  state.turnPhase = null
  return false
}

function finishTurn(state: GameState) {
  // 카드 셔플 (다음 사람이 위치 추측 못하게)
  const pid = state.turnOrder[state.currentTurnIndex]
  if (state.hands[pid]) state.hands[pid] = shuffle(state.hands[pid])

  // 탈출 체크
  if (state.hands[pid]?.length === 0 && !state.eliminatedPlayers.includes(pid)) {
    state.eliminatedPlayers.push(pid)
  }

  // 게임 종료 체크
  const activePlayers = state.turnOrder.filter(
    p => !state.eliminatedPlayers.includes(p) && state.hands[p].length > 0
  )
  if (activePlayers.length <= 1) {
    state.phase = 'finished'
    state.loser = activePlayers[0] ?? null
    state.turnPhase = null
    return
  }

  // 다음 턴
  state.currentTurnIndex = (state.currentTurnIndex + 1) % state.turnOrder.length
  if (!advanceToNextActivePlayer(state)) return // 게임 종료됨
  state.turnPhase = 'draw'
}

async function processAiTurns(
  db: D1Database, roomId: string, state: GameState,
  playerList: { player_id: string; is_ai: number }[]
) {
  const aiIds = new Set(playerList.filter(p => p.is_ai === 1).map(p => p.player_id))

  for (let iter = 0; iter < 40; iter++) {
    if (state.phase !== 'playing') break
    const currentPlayer = state.turnOrder[state.currentTurnIndex]
    if (!aiIds.has(currentPlayer)) break // 사람 턴이면 중단

    if (state.turnPhase === 'draw') {
      // AI: 카드 뽑기
      const targetId = findNextActivePlayer(state, state.currentTurnIndex)
      if (!targetId) break

      const targetHand = state.hands[targetId]
      if (targetHand.length === 0) break

      const position = Math.floor(Math.random() * targetHand.length)
      const drawnCard = targetHand.splice(position, 1)[0]
      state.hands[currentPlayer].push(drawnCard)

      state.lastAction = {
        type: 'draw', player: currentPlayer, from: targetId,
        cardPosition: position, drawnCard,
      }

      if (state.hands[targetId].length === 0 && !state.eliminatedPlayers.includes(targetId)) {
        state.eliminatedPlayers.push(targetId)
      }

      // AI: 페어 자동 버리기
      if (hasPair(state.hands[currentPlayer])) {
        state.turnPhase = 'discard'
      } else {
        finishTurn(state)
      }
    } else if (state.turnPhase === 'discard') {
      // AI: 페어를 모두 버릴 때까지 반복
      let discardedAny = false
      while (hasPair(state.hands[currentPlayer])) {
        const hand = state.hands[currentPlayer]
        const counts = new Map<number, number>()
        for (const c of hand) counts.set(c, (counts.get(c) ?? 0) + 1)

        let found = false
        for (const [card, cnt] of counts) {
          if (card !== 0 && cnt >= 2) {
            let removed = 0
            state.hands[currentPlayer] = hand.filter(c => {
              if (c === card && removed < 2) { removed++; return false }
              return true
            })
            state.lastAction = { type: 'discard', player: currentPlayer, discardedCard: card }
            found = true
            discardedAny = true

            // 탈출 체크
            if (state.hands[currentPlayer].length === 0 && !state.eliminatedPlayers.includes(currentPlayer)) {
              state.eliminatedPlayers.push(currentPlayer)
            }
            break // counts 재계산을 위해 while 루프로 돌아감
          }
        }
        if (!found) break
      }

      finishTurn(state)
    }
  }

  const newStatus = state.phase === 'finished' ? 'finished' : 'playing'
  await db.prepare(
    `UPDATE game_rooms SET status = ?, state = ?, updated_at = datetime('now') WHERE id = ?`
  ).bind(newStatus, JSON.stringify(state), roomId).run()
}

export default app
