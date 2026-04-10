'use client'

import { useEffect, useState, useCallback, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { marbleApi } from '@/lib/api'
import { isLoggedIn } from '@/lib/firebase'

// ─── 타입 ───
interface MarbleTypeInfo {
  id: string; name: string; radius: number; mass: number; restitution: number
  color: string; glow?: string; rarity: 'common' | 'rare' | 'epic' | 'legendary'
}

interface Vec2 { x: number; y: number }

interface MarbleState {
  id: string; type: string; pos: Vec2; vel: Vec2
  radius: number; mass: number; restitution: number; eliminated: boolean
}

interface GameState {
  phase: 'waiting' | 'playing' | 'aiming' | 'simulating' | 'finished'
  marbles: MarbleState[]; turnOrder: string[]; currentTurnIndex: number
  roundNumber: number; maxRounds: number; arenaRadius: number
  results: { playerId: string; eliminated: boolean; rank: number }[]
  lastShot: { playerId: string; angle: number; power: number } | null
}

interface RoomData {
  id: string; hostEmail: string; hostName: string
  maxPlayers: number; betAmount: number; status: string
  players: { player_id: string; nickname: string; marble_type: string; is_ai: number }[]
  state: GameState; myEmail: string; error?: string
}

interface RoomListItem {
  id: string; host_name: string; max_players: number
  bet_amount: number; status: string; player_count: number
}

// ─── 구슬 타입 데이터 (프론트 하드코딩 — 서버와 동일) ───
const MARBLE_TYPES: Record<string, MarbleTypeInfo> = {
  glass:   { id: 'glass',   name: '유리구슬',    radius: 14, mass: 1.0, restitution: 0.7, color: '#7ec8e3', rarity: 'common' },
  steel:   { id: 'steel',   name: '쇠구슬',      radius: 13, mass: 2.0, restitution: 0.5, color: '#a0a0a8', rarity: 'rare' },
  king:    { id: 'king',    name: '왕구슬',      radius: 20, mass: 2.5, restitution: 0.6, color: '#e8c850', glow: 'rgba(232,200,80,0.4)', rarity: 'rare' },
  ruby:    { id: 'ruby',    name: '루비구슬',     radius: 14, mass: 1.2, restitution: 0.8, color: '#e05050', glow: 'rgba(224,80,80,0.3)', rarity: 'epic' },
  emerald: { id: 'emerald', name: '에메랄드구슬',  radius: 14, mass: 1.2, restitution: 0.8, color: '#40c070', glow: 'rgba(64,192,112,0.3)', rarity: 'epic' },
  rainbow: { id: 'rainbow', name: '무지개구슬',    radius: 15, mass: 1.3, restitution: 0.85, color: 'rainbow', glow: 'rgba(200,100,255,0.4)', rarity: 'legendary' },
}

const RARITY_COLOR: Record<string, string> = {
  common: '#a0a0a0', rare: '#5090d0', epic: '#a070d0', legendary: '#e8c850',
}
const RARITY_LABEL: Record<string, string> = {
  common: '일반', rare: '고급', epic: '희귀', legendary: '전설',
}

// ─── Canvas 그리기 유틸 ───
function drawMarble(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, type: string, highlight?: boolean) {
  const mt = MARBLE_TYPES[type] ?? MARBLE_TYPES.glass
  ctx.save()

  // 그림자
  if (mt.glow) {
    ctx.shadowColor = mt.glow
    ctx.shadowBlur = 12
  }

  if (mt.color === 'rainbow') {
    // 무지개 그라디언트
    const grad = ctx.createRadialGradient(x - r * 0.2, y - r * 0.3, r * 0.1, x, y, r)
    grad.addColorStop(0, '#ff8080')
    grad.addColorStop(0.25, '#ffcc50')
    grad.addColorStop(0.5, '#80e080')
    grad.addColorStop(0.75, '#5090e0')
    grad.addColorStop(1, '#c070e0')
    ctx.fillStyle = grad
  } else {
    // 일반 그라디언트
    const grad = ctx.createRadialGradient(x - r * 0.25, y - r * 0.3, r * 0.1, x, y, r)
    grad.addColorStop(0, lighten(mt.color, 60))
    grad.addColorStop(0.6, mt.color)
    grad.addColorStop(1, darken(mt.color, 40))
    ctx.fillStyle = grad
  }

  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()

  // 하이라이트 (빛 반사)
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  const hlGrad = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.05, x - r * 0.15, y - r * 0.2, r * 0.5)
  hlGrad.addColorStop(0, 'rgba(255,255,255,0.7)')
  hlGrad.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = hlGrad
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()

  // 선택 테두리
  if (highlight) {
    ctx.strokeStyle = 'var(--gold-mid)'
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.arc(x, y, r + 3, 0, Math.PI * 2)
    ctx.stroke()
  }

  ctx.restore()
}

function lighten(hex: string, amt: number): string {
  const num = parseInt(hex.replace('#', ''), 16)
  const r = Math.min(255, ((num >> 16) & 0xff) + amt)
  const g = Math.min(255, ((num >> 8) & 0xff) + amt)
  const b = Math.min(255, (num & 0xff) + amt)
  return `rgb(${r},${g},${b})`
}
function darken(hex: string, amt: number): string {
  const num = parseInt(hex.replace('#', ''), 16)
  const r = Math.max(0, ((num >> 16) & 0xff) - amt)
  const g = Math.max(0, ((num >> 8) & 0xff) - amt)
  const b = Math.max(0, (num & 0xff) - amt)
  return `rgb(${r},${g},${b})`
}

// ─── 물리 시뮬레이션 (프론트에서 애니메이션용, 서버 결과와 동기화) ───
function simulateStep(marbles: MarbleState[], arenaRadius: number) {
  const friction = 0.985

  for (const m of marbles) {
    if (m.eliminated) continue
    m.vel.x *= friction
    m.vel.y *= friction
    m.pos.x += m.vel.x
    m.pos.y += m.vel.y
    const speed = Math.sqrt(m.vel.x * m.vel.x + m.vel.y * m.vel.y)
    if (speed < 0.05) { m.vel.x = 0; m.vel.y = 0 }
  }

  // 충돌
  const active = marbles.filter(m => !m.eliminated)
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i], b = active[j]
      const dx = b.pos.x - a.pos.x, dy = b.pos.y - a.pos.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      const minDist = a.radius + b.radius
      if (dist >= minDist || dist === 0) continue

      const nx = dx / dist, ny = dy / dist
      const overlap = minDist - dist
      const total = a.mass + b.mass
      a.pos.x -= nx * overlap * (b.mass / total)
      a.pos.y -= ny * overlap * (b.mass / total)
      b.pos.x += nx * overlap * (a.mass / total)
      b.pos.y += ny * overlap * (a.mass / total)

      const dvx = a.vel.x - b.vel.x, dvy = a.vel.y - b.vel.y
      const dvDotN = dvx * nx + dvy * ny
      if (dvDotN <= 0) continue

      const restitution = Math.min(a.restitution, b.restitution)
      const impulse = (1 + restitution) * dvDotN / total
      a.vel.x -= impulse * b.mass * nx
      a.vel.y -= impulse * b.mass * ny
      b.vel.x += impulse * a.mass * nx
      b.vel.y += impulse * a.mass * ny
    }
  }

  // 원 밖 탈락
  for (const m of marbles) {
    if (m.eliminated) continue
    const dist = Math.sqrt(m.pos.x * m.pos.x + m.pos.y * m.pos.y)
    if (dist + m.radius > arenaRadius) m.eliminated = true
  }
}

// ═══════════════════════════════════════
// 로비
// ═══════════════════════════════════════
function Lobby() {
  const router = useRouter()
  const [rooms, setRooms] = useState<RoomListItem[]>([])
  const [inventory, setInventory] = useState<{ marble_type: string; count: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [maxPlayers, setMaxPlayers] = useState(4)
  const [betAmount, setBetAmount] = useState(1)
  const [selectedType, setSelectedType] = useState('glass')
  const loggedIn = isLoggedIn()

  useEffect(() => {
    loadData()
    const interval = setInterval(loadRooms, 5000)
    return () => clearInterval(interval)
  }, [])

  async function loadData() {
    await Promise.all([loadRooms(), loadInventory()])
  }

  async function loadRooms() {
    try { setRooms(await marbleApi.getRooms()) } catch {}
    setLoading(false)
  }

  async function loadInventory() {
    if (!loggedIn) return
    try { setInventory(await marbleApi.getInventory()) } catch {}
  }

  async function handleCreate() {
    if (!loggedIn) { router.push('/login'); return }
    setCreating(true)
    try {
      const res = await marbleApi.createRoom(maxPlayers, betAmount, selectedType)
      if (res.roomId) router.push(`/marble?room=${res.roomId}`)
    } catch { alert('방 생성 실패') }
    setCreating(false)
  }

  async function handleJoin(roomId: string) {
    if (!loggedIn) { router.push('/login'); return }
    try {
      await marbleApi.joinRoom(roomId, selectedType)
      router.push(`/marble?room=${roomId}`)
    } catch { alert('참가 실패') }
  }

  const getCount = (type: string) => inventory.find(i => i.marble_type === type)?.count ?? 0

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 pb-24">
      {/* 헤더 */}
      <div className="text-center mb-6">
        <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--gold-light)' }}>구슬치기</h1>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          상대 구슬을 밖으로 밀어내면 내 것! 마지막까지 남아라!
        </p>
        <div className="mt-3 p-3 rounded-lg text-xs leading-relaxed" style={{
          background: 'var(--bg-card)', border: '1px solid var(--border-dark)', color: 'var(--text-sub)',
        }}>
          원형 판 위에 구슬을 놓고 돌아가면서 자기 구슬을 튕겨 상대를 밀어냅니다.
          원 밖으로 나간 구슬은 탈락! 마지막까지 구슬이 남은 사람이 모든 배팅 구슬을 가져갑니다.
        </div>
      </div>

      {/* 내 구슬 인벤토리 */}
      {loggedIn && (
        <div className="mb-6 p-4 rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-dark)' }}>
          <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-sub)' }}>내 구슬</h2>
          <div className="flex flex-wrap gap-3">
            {Object.values(MARBLE_TYPES).map(mt => {
              const cnt = getCount(mt.id)
              if (cnt === 0 && mt.rarity !== 'common') return null
              return (
                <div key={mt.id} className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{
                  background: 'var(--bg-base)', border: selectedType === mt.id ? '1.5px solid var(--gold-mid)' : '1px solid var(--border-dark)',
                  cursor: cnt > 0 ? 'pointer' : 'default', opacity: cnt > 0 ? 1 : 0.4,
                }} onClick={() => cnt > 0 && setSelectedType(mt.id)}>
                  <div style={{
                    width: 20, height: 20, borderRadius: '50%',
                    background: mt.color === 'rainbow'
                      ? 'conic-gradient(#f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)'
                      : mt.color,
                    boxShadow: mt.glow ? `0 0 6px ${mt.glow}` : 'none',
                  }} />
                  <div>
                    <span className="text-xs font-semibold" style={{ color: 'var(--text-main)' }}>{mt.name}</span>
                    <span className="text-xs ml-1" style={{ color: RARITY_COLOR[mt.rarity] }}>({RARITY_LABEL[mt.rarity]})</span>
                  </div>
                  <span className="text-xs font-bold" style={{ color: 'var(--gold-mid)' }}>×{cnt}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 방 만들기 */}
      <div className="mb-6">
        {!showCreate ? (
          <button
            onClick={() => loggedIn ? setShowCreate(true) : router.push('/login')}
            className="w-full py-3 rounded-xl font-semibold text-sm"
            style={{
              background: 'linear-gradient(135deg, var(--gold-dark), var(--gold-mid))',
              color: '#000', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            + 새 게임방 만들기
          </button>
        ) : (
          <div className="p-4 rounded-xl space-y-3" style={{
            background: 'var(--bg-card)', border: '1px solid var(--border-gold)',
          }}>
            <div className="flex items-center gap-3">
              <label className="text-sm font-semibold whitespace-nowrap" style={{ color: 'var(--text-main)' }}>인원수</label>
              <select value={maxPlayers} onChange={e => setMaxPlayers(Number(e.target.value))}
                className="px-3 py-1.5 rounded-lg text-sm"
                style={{ background: 'var(--bg-base)', color: 'var(--text-main)', border: '1px solid var(--border-dark)', fontFamily: 'inherit' }}>
                {[2,3,4,5,6].map(n => <option key={n} value={n}>{n}명</option>)}
              </select>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-sm font-semibold whitespace-nowrap" style={{ color: 'var(--text-main)' }}>배팅</label>
              <select value={betAmount} onChange={e => setBetAmount(Number(e.target.value))}
                className="px-3 py-1.5 rounded-lg text-sm"
                style={{ background: 'var(--bg-base)', color: 'var(--text-main)', border: '1px solid var(--border-dark)', fontFamily: 'inherit' }}>
                {[1,2,3,5].map(n => <option key={n} value={n}>{n}개</option>)}
              </select>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                ({MARBLE_TYPES[selectedType]?.name ?? '유리구슬'} ×{betAmount})
              </span>
            </div>
            <div className="flex gap-2">
              <button onClick={handleCreate} disabled={creating} className="flex-1 py-2.5 rounded-lg font-semibold text-sm"
                style={{ background: 'var(--gold-mid)', color: '#000', border: 'none', cursor: 'pointer', fontFamily: 'inherit', opacity: creating ? 0.5 : 1 }}>
                {creating ? '생성 중...' : '방 만들기'}
              </button>
              <button onClick={() => setShowCreate(false)} className="px-4 py-2.5 rounded-lg text-sm"
                style={{ background: 'var(--bg-base)', color: 'var(--text-muted)', border: '1px solid var(--border-dark)', cursor: 'pointer', fontFamily: 'inherit' }}>
                취소
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 방 목록 */}
      <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-sub)' }}>게임 방 목록</h2>
      {loading ? (
        <p className="text-center py-8 text-sm" style={{ color: 'var(--text-muted)' }}>로딩 중...</p>
      ) : rooms.length === 0 ? (
        <div className="text-center py-12 rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-dark)' }}>
          <p className="text-3xl mb-2">🔮</p>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>아직 열린 방이 없습니다</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rooms.map(room => (
            <div key={room.id} className="p-4 rounded-xl flex items-center justify-between"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border-dark)' }}>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-sm" style={{ color: 'var(--text-main)' }}>{room.host_name}의 방</span>
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{
                    background: room.status === 'waiting' ? 'rgba(76,175,80,0.15)' : 'rgba(255,152,0,0.15)',
                    color: room.status === 'waiting' ? '#4caf50' : '#ff9800',
                  }}>
                    {room.status === 'waiting' ? '대기중' : '진행중'}
                  </span>
                </div>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {room.player_count}/{room.max_players}명 · 배팅 {room.bet_amount}개
                </span>
              </div>
              {room.status === 'waiting' && (
                <button onClick={() => handleJoin(room.id)} className="px-4 py-2 rounded-lg text-sm font-semibold"
                  style={{ background: 'var(--gold-mid)', color: '#000', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                  참가
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════
// 게임방 (Canvas 게임)
// ═══════════════════════════════════════
function GameRoom({ roomId }: { roomId: string }) {
  const router = useRouter()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [room, setRoom] = useState<RoomData | null>(null)
  const [loading, setLoading] = useState(true)
  const [shooting, setShooting] = useState(false)
  const [showResult, setShowResult] = useState(false)

  // 조준 상태
  const [aiming, setAiming] = useState(false)
  const [aimStart, setAimStart] = useState<Vec2 | null>(null)
  const [aimCurrent, setAimCurrent] = useState<Vec2 | null>(null)

  // 애니메이션용 로컬 구슬 상태
  const [localMarbles, setLocalMarbles] = useState<MarbleState[]>([])
  const [animating, setAnimating] = useState(false)
  const animRef = useRef<number>(0)

  const CANVAS_SIZE = 360
  const SCALE = CANVAS_SIZE / (140 * 2 + 40) // arena fits in canvas with padding

  const getNickname = useCallback((pid: string) => {
    return room?.players.find(p => p.player_id === pid)?.nickname ?? pid.slice(0, 8)
  }, [room?.players])

  const getMarbleType = useCallback((pid: string) => {
    return room?.players.find(p => p.player_id === pid)?.marble_type ?? 'glass'
  }, [room?.players])

  const loadRoom = useCallback(async () => {
    try {
      const data: RoomData = await marbleApi.getRoom(roomId)
      if (data.error) { router.push('/marble'); return }
      setRoom(data)

      // 서버 상태와 로컬 상태 동기화 (애니메이션 중이 아닐 때)
      if (!animating) {
        setLocalMarbles(JSON.parse(JSON.stringify(data.state.marbles)))
      }

      if (data.state.phase === 'finished' && !showResult) setShowResult(true)
    } catch {}
    setLoading(false)
  }, [roomId, router, showResult, animating])

  useEffect(() => {
    loadRoom()
    const interval = setInterval(loadRoom, 2500)
    return () => clearInterval(interval)
  }, [loadRoom])

  // Canvas 렌더링
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = CANVAS_SIZE * dpr
    canvas.height = CANVAS_SIZE * dpr
    ctx.scale(dpr, dpr)

    const cx = CANVAS_SIZE / 2
    const cy = CANVAS_SIZE / 2
    const arenaR = (room?.state.arenaRadius ?? 140) * SCALE

    // 배경
    ctx.fillStyle = '#0f0c08'
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)

    // 흙바닥 질감
    const earthGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, arenaR)
    earthGrad.addColorStop(0, '#3a2a14')
    earthGrad.addColorStop(0.7, '#2a1c0c')
    earthGrad.addColorStop(1, '#1a1208')
    ctx.fillStyle = earthGrad
    ctx.beginPath()
    ctx.arc(cx, cy, arenaR, 0, Math.PI * 2)
    ctx.fill()

    // 원 테두리
    ctx.strokeStyle = 'rgba(212,160,23,0.35)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(cx, cy, arenaR, 0, Math.PI * 2)
    ctx.stroke()

    // 점선 원
    ctx.setLineDash([4, 4])
    ctx.strokeStyle = 'rgba(212,160,23,0.12)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(cx, cy, arenaR * 0.5, 0, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([])

    // 구슬 그리기
    for (const m of localMarbles) {
      if (m.eliminated) continue
      const sx = cx + m.pos.x * SCALE
      const sy = cy + m.pos.y * SCALE
      const sr = m.radius * SCALE

      const isMyMarble = m.id === room?.myEmail
      const isCurrent = room?.state.phase === 'aiming' &&
        room?.state.turnOrder[room.state.currentTurnIndex] === m.id

      drawMarble(ctx, sx, sy, sr, m.type, isMyMarble && isCurrent)
    }

    // 조준선 그리기
    if (aiming && aimStart && aimCurrent && room?.state.phase === 'aiming') {
      const myMarble = localMarbles.find(m => m.id === room.myEmail && !m.eliminated)
      if (myMarble) {
        const mx = cx + myMarble.pos.x * SCALE
        const my = cy + myMarble.pos.y * SCALE

        const dx = aimStart.x - aimCurrent.x
        const dy = aimStart.y - aimCurrent.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        const maxDrag = 100
        const power = Math.min(dist / maxDrag, 1)

        // 발사 방향 (드래그 반대)
        if (dist > 5) {
          const angle = Math.atan2(dy, dx)
          const arrowLen = power * 60

          ctx.strokeStyle = `rgba(245,200,66,${0.4 + power * 0.5})`
          ctx.lineWidth = 2
          ctx.setLineDash([6, 3])
          ctx.beginPath()
          ctx.moveTo(mx, my)
          ctx.lineTo(mx + Math.cos(angle) * arrowLen, my + Math.sin(angle) * arrowLen)
          ctx.stroke()
          ctx.setLineDash([])

          // 파워 표시
          ctx.fillStyle = power > 0.8 ? '#e05050' : power > 0.5 ? '#e8c850' : '#81c784'
          ctx.font = 'bold 11px Pretendard, sans-serif'
          ctx.textAlign = 'center'
          ctx.fillText(`${Math.round(power * 100)}%`, mx, my - myMarble.radius * SCALE - 8)
        }
      }
    }
  }, [localMarbles, room, aiming, aimStart, aimCurrent, SCALE])

  // 발사 애니메이션
  function playShootAnimation(angle: number, power: number) {
    const myMarble = localMarbles.find(m => m.id === room?.myEmail && !m.eliminated)
    if (!myMarble) return

    setAnimating(true)
    const maxSpeed = 18
    const speed = power * maxSpeed
    myMarble.vel = { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed }

    const marblesClone: MarbleState[] = JSON.parse(JSON.stringify(localMarbles))
    const shooter = marblesClone.find(m => m.id === room?.myEmail && !m.eliminated)
    if (shooter) {
      shooter.vel = { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed }
    }

    let frame = 0
    const maxFrames = 180 // 3초
    function animate() {
      simulateStep(marblesClone, room?.state.arenaRadius ?? 140)
      setLocalMarbles(JSON.parse(JSON.stringify(marblesClone)))
      frame++

      const anyMoving = marblesClone.some(m => !m.eliminated && (Math.abs(m.vel.x) > 0.05 || Math.abs(m.vel.y) > 0.05))
      if (anyMoving && frame < maxFrames) {
        animRef.current = requestAnimationFrame(animate)
      } else {
        setAnimating(false)
        // 서버 결과 반영
        loadRoom()
      }
    }
    animRef.current = requestAnimationFrame(animate)
  }

  // 터치/마우스 이벤트
  function getCanvasPos(e: React.MouseEvent | React.TouchEvent): Vec2 {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    const clientX = 'touches' in e ? e.touches[0]?.clientX ?? 0 : e.clientX
    const clientY = 'touches' in e ? e.touches[0]?.clientY ?? 0 : e.clientY
    return { x: clientX - rect.left, y: clientY - rect.top }
  }

  function handlePointerDown(e: React.MouseEvent | React.TouchEvent) {
    if (room?.state.phase !== 'aiming') return
    if (room.state.turnOrder[room.state.currentTurnIndex] !== room.myEmail) return
    if (animating || shooting) return

    const pos = getCanvasPos(e)
    setAiming(true)
    setAimStart(pos)
    setAimCurrent(pos)
  }

  function handlePointerMove(e: React.MouseEvent | React.TouchEvent) {
    if (!aiming) return
    const pos = getCanvasPos(e)
    setAimCurrent(pos)
  }

  async function handlePointerUp() {
    if (!aiming || !aimStart || !aimCurrent) { setAiming(false); return }

    const dx = aimStart.x - aimCurrent.x
    const dy = aimStart.y - aimCurrent.y
    const dist = Math.sqrt(dx * dx + dy * dy)

    if (dist < 10) { setAiming(false); return } // 너무 짧은 드래그 무시

    const maxDrag = 100
    const power = Math.min(dist / maxDrag, 1)
    const angle = Math.atan2(dy, dx) // 드래그 반대 방향

    setAiming(false)
    setAimStart(null)
    setAimCurrent(null)
    setShooting(true)

    // 애니메이션 시작
    playShootAnimation(angle, power)

    try {
      await marbleApi.shoot(roomId, angle, power)
      await loadRoom()
    } catch {}
    setShooting(false)
  }

  // 게임 액션
  async function handleStart() {
    const res = await marbleApi.startGame(roomId)
    if (res.error) alert(res.error)
    loadRoom()
  }

  async function handleAddAi() {
    await marbleApi.addAi(roomId)
    loadRoom()
  }

  async function handleRemoveAi(aiId: string) {
    await marbleApi.removeAi(roomId, aiId)
    loadRoom()
  }

  async function handleLeave() {
    if (confirm('정말 나가시겠습니까?')) {
      await marbleApi.leaveRoom(roomId)
      router.push('/marble')
    }
  }

  if (loading) return <div className="flex items-center justify-center min-h-[50vh]"><p style={{ color: 'var(--text-muted)' }}>로딩 중...</p></div>
  if (!room) return <div className="flex items-center justify-center min-h-[50vh]"><p style={{ color: 'var(--text-muted)' }}>방을 찾을 수 없습니다</p></div>

  const { state } = room
  const isHost = room.myEmail === room.hostEmail
  const isMyTurn = state.phase === 'aiming' && state.turnOrder[state.currentTurnIndex] === room.myEmail
  const currentPlayer = state.turnOrder[state.currentTurnIndex]

  // ─── 대기실 ───
  if (state.phase === 'waiting') {
    return (
      <div className="max-w-lg mx-auto px-4 py-8 pb-24">
        <div className="text-center mb-6">
          <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--gold-light)' }}>구슬치기 · {roomId}</h1>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            방장: {room.hostName} · 최대 {room.maxPlayers}명 · 배팅 {room.betAmount}개
          </p>
        </div>

        <div className="mb-6 p-4 rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-dark)' }}>
          <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-sub)' }}>
            참가자 ({room.players.length}/{room.maxPlayers})
          </h2>
          <div className="space-y-2">
            {room.players.map(p => (
              <div key={p.player_id} className="flex items-center justify-between py-1.5 px-2 rounded-lg" style={{ background: 'var(--bg-base)' }}>
                <div className="flex items-center gap-2">
                  <div style={{
                    width: 16, height: 16, borderRadius: '50%',
                    background: MARBLE_TYPES[p.marble_type]?.color === 'rainbow'
                      ? 'conic-gradient(#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)'
                      : MARBLE_TYPES[p.marble_type]?.color ?? '#7ec8e3',
                  }} />
                  <span className="text-sm font-medium" style={{ color: 'var(--text-main)' }}>{p.nickname}</span>
                  {p.is_ai === 1 && <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(156,39,176,0.15)', color: '#ce93d8', fontSize: 10 }}>AI</span>}
                  {p.player_id === room.hostEmail && <span className="text-xs" style={{ color: 'var(--gold-mid)' }}>👑</span>}
                </div>
                {isHost && p.is_ai === 1 && (
                  <button onClick={() => handleRemoveAi(p.player_id)} className="text-xs px-2 py-1 rounded"
                    style={{ background: 'rgba(224,80,80,0.15)', color: '#e05050', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                    제거
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {isHost && (
          <div className="space-y-2">
            {room.players.length < room.maxPlayers && (
              <button onClick={handleAddAi} className="w-full py-2.5 rounded-lg text-sm font-semibold"
                style={{ background: 'rgba(156,39,176,0.15)', color: '#ce93d8', border: '1px solid rgba(156,39,176,0.3)', cursor: 'pointer', fontFamily: 'inherit' }}>
                + AI 추가
              </button>
            )}
            <button onClick={handleStart} disabled={room.players.length < 2} className="w-full py-3 rounded-xl text-sm font-bold"
              style={{
                background: room.players.length >= 2 ? 'linear-gradient(135deg, var(--gold-dark), var(--gold-mid))' : 'var(--bg-base)',
                color: room.players.length >= 2 ? '#000' : 'var(--text-muted)',
                border: 'none', cursor: room.players.length >= 2 ? 'pointer' : 'default', fontFamily: 'inherit',
              }}>
              {room.players.length < 2 ? `최소 2명 필요` : '게임 시작!'}
            </button>
          </div>
        )}

        {!isHost && (
          <p className="text-center text-sm py-4" style={{ color: 'var(--text-muted)' }}>방장이 게임을 시작할 때까지 기다려 주세요...</p>
        )}

        <button onClick={handleLeave} className="w-full mt-4 py-2 rounded-lg text-xs"
          style={{ background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border-dark)', cursor: 'pointer', fontFamily: 'inherit' }}>
          나가기
        </button>
      </div>
    )
  }

  // ─── 게임 플레이 ───
  return (
    <div className="max-w-lg mx-auto px-4 py-4 pb-24">
      {/* 상단 바 */}
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-sm font-bold" style={{ color: 'var(--gold-light)' }}>구슬치기 · {roomId}</h1>
        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>R{state.roundNumber}</span>
          <button onClick={() => router.push('/marble')} className="text-xs px-2 py-1 rounded"
            style={{ color: 'var(--text-muted)', background: 'var(--bg-card)', border: '1px solid var(--border-dark)', cursor: 'pointer', fontFamily: 'inherit' }}>
            로비
          </button>
        </div>
      </div>

      {/* 결과 모달 */}
      {showResult && state.phase === 'finished' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="mx-4 p-6 rounded-2xl text-center max-w-sm w-full" style={{ background: 'var(--bg-card)', border: '2px solid var(--gold-mid)' }}>
            <p className="text-4xl mb-3">🏆</p>
            <h2 className="text-lg font-bold mb-4" style={{ color: 'var(--gold-light)' }}>게임 결과</h2>
            <div className="space-y-2 mb-6">
              {state.results.map((r, i) => (
                <div key={r.playerId} className="flex items-center justify-between px-3 py-2 rounded-lg" style={{
                  background: i === 0 ? 'rgba(212,160,23,0.15)' : 'var(--bg-base)',
                  border: i === 0 ? '1px solid var(--gold-mid)' : '1px solid var(--border-dark)',
                }}>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold" style={{ color: i === 0 ? 'var(--gold-light)' : 'var(--text-muted)' }}>
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}위`}
                    </span>
                    <span className="text-sm" style={{ color: r.playerId === room.myEmail ? 'var(--gold-light)' : 'var(--text-main)' }}>
                      {getNickname(r.playerId)}
                    </span>
                  </div>
                  {i === 0 && (
                    <span className="text-xs font-bold" style={{ color: 'var(--gold-mid)' }}>
                      +{room.betAmount * room.players.length}개
                    </span>
                  )}
                </div>
              ))}
            </div>
            <div className="space-y-2">
              <button onClick={() => setShowResult(false)} className="w-full py-2.5 rounded-lg text-sm font-semibold"
                style={{ background: 'var(--gold-mid)', color: '#000', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                확인
              </button>
              <button onClick={() => router.push('/marble')} className="w-full py-2.5 rounded-lg text-sm"
                style={{ background: 'var(--bg-base)', color: 'var(--text-muted)', border: '1px solid var(--border-dark)', cursor: 'pointer', fontFamily: 'inherit' }}>
                로비로 돌아가기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 턴 안내 */}
      {state.phase !== 'finished' && (
        <div className="mb-3 p-2.5 rounded-xl text-center" style={{
          background: isMyTurn ? 'rgba(212,160,23,0.15)' : 'var(--bg-card)',
          border: isMyTurn ? '2px solid var(--gold-mid)' : '1px solid var(--border-dark)',
        }}>
          {isMyTurn ? (
            <p className="text-sm font-bold" style={{ color: 'var(--gold-light)' }}>
              🎯 당신의 턴! 구슬을 드래그하여 조준하세요
            </p>
          ) : (
            <p className="text-sm" style={{ color: 'var(--text-sub)' }}>
              {getNickname(currentPlayer)}의 턴...
            </p>
          )}
        </div>
      )}

      {/* Canvas 게임판 */}
      <div className="flex justify-center mb-3">
        <canvas
          ref={canvasRef}
          style={{
            width: CANVAS_SIZE, height: CANVAS_SIZE,
            borderRadius: 16, border: '1px solid var(--border-gold)',
            touchAction: 'none',
            cursor: isMyTurn && !animating ? 'crosshair' : 'default',
          }}
          onMouseDown={handlePointerDown}
          onMouseMove={handlePointerMove}
          onMouseUp={handlePointerUp}
          onMouseLeave={() => { if (aiming) { setAiming(false) } }}
          onTouchStart={handlePointerDown}
          onTouchMove={handlePointerMove}
          onTouchEnd={handlePointerUp}
        />
      </div>

      {/* 플레이어 스코어보드 */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        {state.turnOrder.map(pid => {
          const p = room.players.find(pl => pl.player_id === pid)
          const marbleCount = localMarbles.filter(m => m.id === pid && !m.eliminated).length
          const isCurrent = state.phase !== 'finished' && pid === currentPlayer
          const isMe = pid === room.myEmail

          return (
            <div key={pid} className="p-2 rounded-lg text-center" style={{
              background: isCurrent ? 'rgba(212,160,23,0.12)' : 'var(--bg-card)',
              border: isCurrent ? '2px solid var(--gold-dark)' : '1px solid var(--border-dark)',
            }}>
              <div className="flex items-center justify-center gap-1 mb-1">
                <div style={{
                  width: 10, height: 10, borderRadius: '50%',
                  background: MARBLE_TYPES[p?.marble_type ?? 'glass']?.color === 'rainbow'
                    ? 'conic-gradient(#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)'
                    : MARBLE_TYPES[p?.marble_type ?? 'glass']?.color ?? '#7ec8e3',
                }} />
                <span className="text-xs font-semibold truncate" style={{ color: isMe ? 'var(--gold-light)' : 'var(--text-main)' }}>
                  {p?.nickname ?? pid.slice(0, 6)}
                </span>
              </div>
              <p className="text-[10px]" style={{ color: marbleCount === 0 ? '#e05050' : 'var(--text-muted)' }}>
                {marbleCount === 0 ? '탈락' : `${marbleCount}개`}
              </p>
              {p?.is_ai === 1 && <span className="text-[9px]" style={{ color: '#ce93d8' }}>AI</span>}
            </div>
          )
        })}
      </div>

      {/* 게임 종료 */}
      {state.phase === 'finished' && (
        <div className="p-3 rounded-xl text-center" style={{ background: 'rgba(212,160,23,0.1)', border: '1px solid var(--border-gold)' }}>
          <p className="text-sm font-bold" style={{ color: 'var(--gold-light)' }}>
            🏆 우승: {getNickname(state.results[0]?.playerId ?? '')}
          </p>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════
// 메인 페이지 (라우터)
// ═══════════════════════════════════════
function MarblePageInner() {
  const searchParams = useSearchParams()
  const roomId = searchParams.get('room')
  if (roomId) return <GameRoom roomId={roomId} />
  return <Lobby />
}

export default function MarblePage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-[50vh]"><p style={{ color: 'var(--text-muted)' }}>로딩 중...</p></div>}>
      <MarblePageInner />
    </Suspense>
  )
}
