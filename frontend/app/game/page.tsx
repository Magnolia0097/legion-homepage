'use client'

import { useEffect, useState, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { gameApi } from '@/lib/api'
import { isLoggedIn } from '@/lib/firebase'

// ─── 타입 ───
interface RoomListItem {
  id: string
  host_name: string
  max_players: number
  status: string
  player_count: number
}

interface Player {
  player_id: string
  nickname: string
  is_ai: number
}

interface GameState {
  phase: 'waiting' | 'playing' | 'finished'
  turnPhase: 'draw' | 'discard' | null
  turnOrder: string[]
  currentTurnIndex: number
  eliminatedPlayers: string[]
  lastAction: {
    type: string
    player: string
    from?: string
    cardPosition?: number
    drawnCard?: number
    discardedCard?: number
  } | null
  loser: string | null
  myHand: number[]
  handCounts: Record<string, number>
}

interface RoomData {
  id: string
  hostEmail: string
  hostName: string
  maxPlayers: number
  status: string
  players: Player[]
  state: GameState
  myEmail: string
  error?: string
}

// 카드 → 포커 스타일 (A~K + 무늬)
const SUITS = ['♠', '♥', '♦', '♣'] as const
const SUIT_COLORS: Record<string, string> = { '♠': '#c8b06a', '♥': '#e05050', '♦': '#e05050', '♣': '#c8b06a' }
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const

function getCardSuit(n: number): string {
  if (n === 0) return ''
  return SUITS[(n - 1) % 4]
}
function getCardRank(n: number): string {
  if (n === 0) return 'JOKER'
  return RANKS[Math.floor((n - 1) / 4) % 13] ?? String(n)
}
function getCardSuitColor(n: number): string {
  if (n === 0) return '#e05050'
  return SUIT_COLORS[getCardSuit(n)] ?? '#c8b06a'
}

// 포커 카드 앞면 컴포넌트
function PokerCard({ card, small }: { card: number; small?: boolean }) {
  const w = small ? 48 : 56
  const h = small ? 72 : 84
  const suit = getCardSuit(card)
  const rank = getCardRank(card)
  const color = getCardSuitColor(card)
  const isJoker = card === 0

  return (
    <div style={{
      width: w, height: h, borderRadius: 6, position: 'relative', overflow: 'hidden',
      background: 'linear-gradient(145deg, #1c1710, #0f0c08)',
      border: `1.5px solid rgba(200,176,106,0.4)`,
      boxShadow: '0 2px 8px rgba(0,0,0,0.5), inset 0 1px 0 rgba(200,176,106,0.1)',
      flexShrink: 0,
    }}>
      {/* 코너 장식선 */}
      <div style={{ position: 'absolute', top: 2, left: 2, right: 2, bottom: 2, borderRadius: 4, border: '0.5px solid rgba(200,176,106,0.12)', pointerEvents: 'none' }} />
      {isJoker ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 2 }}>
          <span style={{ fontSize: small ? 20 : 26, lineHeight: 1 }}>🃏</span>
          <span style={{ fontSize: small ? 7 : 8, color: '#e05050', fontWeight: 700, letterSpacing: 1 }}>JOKER</span>
        </div>
      ) : (
        <>
          {/* 좌상단 */}
          <div style={{ position: 'absolute', top: 3, left: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1 }}>
            <span style={{ fontSize: small ? 10 : 12, fontWeight: 800, color }}>{rank}</span>
            <span style={{ fontSize: small ? 8 : 10, color, marginTop: -1 }}>{suit}</span>
          </div>
          {/* 중앙 무늬 */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <span style={{ fontSize: small ? 20 : 26, color, opacity: 0.85 }}>{suit}</span>
          </div>
          {/* 우하단 (뒤집힘) */}
          <div style={{ position: 'absolute', bottom: 3, right: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1, transform: 'rotate(180deg)' }}>
            <span style={{ fontSize: small ? 10 : 12, fontWeight: 800, color }}>{rank}</span>
            <span style={{ fontSize: small ? 8 : 10, color, marginTop: -1 }}>{suit}</span>
          </div>
        </>
      )}
    </div>
  )
}

// 포커 카드 뒷면 컴포넌트
function PokerCardBack({ selected, small, onClick }: { selected?: boolean; small?: boolean; onClick?: () => void }) {
  const w = small ? 48 : 56
  const h = small ? 72 : 84
  return (
    <button onClick={onClick} style={{
      width: w, height: h, borderRadius: 6, position: 'relative', overflow: 'hidden',
      background: selected
        ? 'linear-gradient(145deg, #3d2e0a, #2a1f04)'
        : 'linear-gradient(145deg, #1a1530, #0e0b1e)',
      border: selected ? '2px solid var(--gold-mid)' : '1.5px solid rgba(200,176,106,0.3)',
      boxShadow: selected
        ? '0 0 12px rgba(212,160,23,0.4), 0 2px 8px rgba(0,0,0,0.5)'
        : '0 2px 8px rgba(0,0,0,0.5)',
      cursor: 'pointer', padding: 0, fontFamily: 'inherit', flexShrink: 0,
      transition: 'all 0.15s ease',
      transform: selected ? 'translateY(-6px)' : 'none',
    }}>
      {/* 뒷면 패턴 */}
      <div style={{
        position: 'absolute', top: 3, left: 3, right: 3, bottom: 3,
        borderRadius: 3,
        border: '1px solid rgba(200,176,106,0.2)',
        background: selected
          ? 'repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(212,160,23,0.08) 3px, rgba(212,160,23,0.08) 6px)'
          : 'repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(100,80,160,0.08) 3px, rgba(100,80,160,0.08) 6px)',
      }} />
      {/* 중앙 장식 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <div style={{
          width: small ? 18 : 22, height: small ? 18 : 22,
          borderRadius: '50%',
          border: `1px solid ${selected ? 'rgba(212,160,23,0.5)' : 'rgba(200,176,106,0.2)'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: small ? 10 : 12,
          color: selected ? 'var(--gold-mid)' : 'rgba(200,176,106,0.3)',
        }}>
          ✦
        </div>
      </div>
    </button>
  )
}

// ═══════════════════════════════════════════
// 로비 컴포넌트
// ═══════════════════════════════════════════
function Lobby() {
  const router = useRouter()
  const [rooms, setRooms] = useState<RoomListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [maxPlayers, setMaxPlayers] = useState(10)
  const [showCreate, setShowCreate] = useState(false)
  const loggedIn = isLoggedIn()

  useEffect(() => {
    loadRooms()
    const interval = setInterval(loadRooms, 5000)
    return () => clearInterval(interval)
  }, [])

  async function loadRooms() {
    try {
      const data = await gameApi.getRooms()
      setRooms(Array.isArray(data) ? data : [])
    } catch { /* ignore */ }
    setLoading(false)
  }

  async function handleCreate() {
    if (!loggedIn) { router.push('/login'); return }
    setCreating(true)
    try {
      const res = await gameApi.createRoom(maxPlayers)
      if (res.roomId) router.push(`/game?room=${res.roomId}`)
    } catch { alert('방 생성 실패') }
    setCreating(false)
  }

  async function handleJoin(roomId: string) {
    if (!loggedIn) { router.push('/login'); return }
    try {
      await gameApi.joinRoom(roomId)
      router.push(`/game?room=${roomId}`)
    } catch { alert('참가 실패') }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 pb-24">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--gold-light)' }}>
          도둑잡기
        </h1>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          조커를 마지막까지 들고 있는 사람이 도둑!
        </p>
        <div className="mt-3 p-3 rounded-lg text-xs leading-relaxed" style={{
          background: 'var(--bg-card)', border: '1px solid var(--border-dark)',
          color: 'var(--text-sub)',
        }}>
          카드를 나눠 받고 같은 숫자 쌍을 버립니다. 돌아가면서 옆 사람 카드를 한 장씩 뽑아
          쌍이 맞으면 버리고, 손에 카드가 없으면 탈출! 마지막에 조커(도둑)를 들고 있으면 패배!
        </div>
      </div>

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
              <label className="text-sm font-semibold" style={{ color: 'var(--text-main)' }}>인원수</label>
              <select
                value={maxPlayers}
                onChange={e => setMaxPlayers(Number(e.target.value))}
                className="px-3 py-1.5 rounded-lg text-sm"
                style={{ background: 'var(--bg-base)', color: 'var(--text-main)', border: '1px solid var(--border-dark)', fontFamily: 'inherit' }}
              >
                {[3,4,5,6,7,8,9,10].map(n => (
                  <option key={n} value={n}>{n}명</option>
                ))}
              </select>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>(AI로 빈자리 채울 수 있어요)</span>
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
          <p className="text-3xl mb-2">🃏</p>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>아직 열린 방이 없습니다</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>새 게임방을 만들어 보세요!</p>
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
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{room.player_count}/{room.max_players}명</span>
              </div>
              {room.status === 'waiting' && (
                <button onClick={() => handleJoin(room.id)} className="px-4 py-2 rounded-lg text-sm font-semibold"
                  style={{ background: 'var(--gold-mid)', color: '#000', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                  참가
                </button>
              )}
              {room.status === 'playing' && (
                <button onClick={() => router.push(`/game?room=${room.id}`)} className="px-4 py-2 rounded-lg text-sm"
                  style={{ background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border-dark)', cursor: 'pointer', fontFamily: 'inherit' }}>
                  관전
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════
// 게임방 컴포넌트
// ═══════════════════════════════════════════
function GameRoom({ roomId }: { roomId: string }) {
  const router = useRouter()
  const [room, setRoom] = useState<RoomData | null>(null)
  const [loading, setLoading] = useState(true)
  const [drawing, setDrawing] = useState(false)
  const [selectedCard, setSelectedCard] = useState<number | null>(null)
  const [selectedPairCard, setSelectedPairCard] = useState<number | null>(null) // 버릴 페어 카드 번호
  const [discarding, setDiscarding] = useState(false)
  const [actionLog, setActionLog] = useState<string[]>([])
  const [showResult, setShowResult] = useState(false)
  const [lastActionKey, setLastActionKey] = useState('')

  const getNickname = useCallback((playerId: string) => {
    return room?.players.find(p => p.player_id === playerId)?.nickname ?? playerId
  }, [room?.players])

  const loadRoom = useCallback(async () => {
    try {
      const data: RoomData = await gameApi.getRoom(roomId)
      if (data.error) {
        router.push('/game')
        return
      }
      setRoom(data)

      if (data.state?.lastAction) {
        const a = data.state.lastAction
        const key = `${a.type}-${a.player}-${a.from ?? ''}-${a.drawnCard ?? ''}-${a.discardedCard ?? ''}-${a.cardPosition ?? ''}`
        setLastActionKey(prev => {
          if (prev === key) return prev
          const playerName = data.players.find(p => p.player_id === a.player)?.nickname ?? a.player
          let logMsg = ''
          if (a.type === 'draw' && a.from) {
            const fromName = data.players.find(p => p.player_id === a.from)?.nickname ?? a.from
            logMsg = `${playerName}이(가) ${fromName}에게서 카드를 뽑았습니다`
          } else if (a.type === 'discard' && a.discardedCard != null) {
            const c = a.discardedCard
            const label = c === 0 ? '🃏' : `${getCardRank(c)}${getCardSuit(c)}`
            logMsg = `${playerName}이(가) ${label} 페어를 버렸습니다`
          } else if (a.type === 'pass') {
            logMsg = `${playerName}이(가) 턴을 넘겼습니다`
          }
          if (logMsg) setActionLog(logs => [logMsg, ...logs].slice(0, 20))
          return key
        })
      }

      if (data.state?.phase === 'finished' && !showResult) {
        setShowResult(true)
      }
    } catch { /* ignore */ }
    setLoading(false)
  }, [roomId, router, showResult])

  useEffect(() => {
    loadRoom()
    const interval = setInterval(loadRoom, 2000)
    return () => clearInterval(interval)
  }, [loadRoom])

  async function handleAddAi() {
    await gameApi.addAi(roomId)
    loadRoom()
  }

  async function handleRemoveAi(aiId: string) {
    await gameApi.removeAi(roomId, aiId)
    loadRoom()
  }

  async function handleStart() {
    const res = await gameApi.startGame(roomId)
    if (res.error) alert(res.error)
    loadRoom()
  }

  async function handleConfirmDraw() {
    if (drawing || selectedCard === null) return
    setDrawing(true)
    try {
      const res = await gameApi.drawCard(roomId, selectedCard)
      if (res.error) alert(res.error)
      await loadRoom()
    } catch { /* ignore */ }
    setDrawing(false)
    setSelectedCard(null)
  }

  async function handleDiscardPair() {
    if (discarding || selectedPairCard === null) return
    setDiscarding(true)
    try {
      const res = await gameApi.discardPair(roomId, selectedPairCard)
      if (res.error) alert(res.error)
      await loadRoom()
    } catch { /* ignore */ }
    setDiscarding(false)
    setSelectedPairCard(null)
  }

  async function handlePass() {
    try {
      const res = await gameApi.passTurn(roomId)
      if (res.error) alert(res.error)
      await loadRoom()
    } catch { /* ignore */ }
  }

  async function handleLeave() {
    if (confirm('정말 나가시겠습니까?')) {
      await gameApi.leaveRoom(roomId)
      router.push('/game')
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center min-h-[50vh]"><p style={{ color: 'var(--text-muted)' }}>로딩 중...</p></div>
  }
  if (!room) {
    return <div className="flex items-center justify-center min-h-[50vh]"><p style={{ color: 'var(--text-muted)' }}>방을 찾을 수 없습니다</p></div>
  }

  const { state } = room
  const isHost = room.myEmail === room.hostEmail
  const isMyTurn = state.phase === 'playing' && state.turnOrder[state.currentTurnIndex] === room.myEmail
  const isDrawPhase = isMyTurn && state.turnPhase === 'draw'
  const isDiscardPhase = isMyTurn && state.turnPhase === 'discard'
  const amIPlaying = state.turnOrder.includes(room.myEmail)
  const amIEliminated = state.eliminatedPlayers.includes(room.myEmail)
  const currentPlayer = state.turnOrder[state.currentTurnIndex]

  // 내 핸드에서 페어 가능한 카드 번호들
  const pairableCards = new Set<number>()
  if (isDiscardPhase) {
    const counts = new Map<number, number>()
    for (const c of state.myHand) {
      if (c === 0) continue
      counts.set(c, (counts.get(c) ?? 0) + 1)
    }
    for (const [card, cnt] of counts) {
      if (cnt >= 2) pairableCards.add(card)
    }
  }

  function getDrawTarget(): string | null {
    if (state.phase !== 'playing') return null
    const len = state.turnOrder.length
    for (let i = 1; i < len; i++) {
      const idx = (state.currentTurnIndex + i) % len
      const pid = state.turnOrder[idx]
      if (!state.eliminatedPlayers.includes(pid) && (state.handCounts[pid] ?? 0) > 0) return pid
    }
    return null
  }
  const drawTarget = getDrawTarget()

  // ─── 대기실 ───
  if (state.phase === 'waiting') {
    return (
      <div className="max-w-lg mx-auto px-4 py-8 pb-24">
        <div className="text-center mb-6">
          <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--gold-light)' }}>게임방 {roomId}</h1>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>방장: {room.hostName} · 최대 {room.maxPlayers}명</p>
        </div>

        <div className="mb-6 p-4 rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-dark)' }}>
          <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-sub)' }}>
            참가자 ({room.players.length}/{room.maxPlayers})
          </h2>
          <div className="space-y-2">
            {room.players.map((p) => (
              <div key={p.player_id} className="flex items-center justify-between py-1.5 px-2 rounded-lg" style={{ background: 'var(--bg-base)' }}>
                <div className="flex items-center gap-2">
                  <span className="text-xs px-1.5 py-0.5 rounded" style={{
                    background: p.is_ai ? 'rgba(156,39,176,0.15)' : 'rgba(76,175,80,0.15)',
                    color: p.is_ai ? '#ce93d8' : '#81c784', fontSize: '10px',
                  }}>{p.is_ai ? 'AI' : '사람'}</span>
                  <span className="text-sm font-medium" style={{ color: 'var(--text-main)' }}>{p.nickname}</span>
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
            <button onClick={handleStart} disabled={room.players.length < 3} className="w-full py-3 rounded-xl text-sm font-bold"
              style={{
                background: room.players.length >= 3 ? 'linear-gradient(135deg, var(--gold-dark), var(--gold-mid))' : 'var(--bg-base)',
                color: room.players.length >= 3 ? '#000' : 'var(--text-muted)',
                border: 'none', cursor: room.players.length >= 3 ? 'pointer' : 'default', fontFamily: 'inherit',
              }}>
              {room.players.length < 3 ? `최소 3명 필요 (현재 ${room.players.length}명)` : '게임 시작!'}
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
  const currentPlayerName = getNickname(currentPlayer)

  return (
    <div className="max-w-2xl mx-auto px-4 py-4 pb-24">
      {/* 상단 */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-sm font-bold" style={{ color: 'var(--gold-light)' }}>도둑잡기 · {roomId}</h1>
        <button onClick={() => router.push('/game')} className="text-xs px-2 py-1 rounded"
          style={{ color: 'var(--text-muted)', background: 'var(--bg-card)', border: '1px solid var(--border-dark)', cursor: 'pointer', fontFamily: 'inherit' }}>
          로비
        </button>
      </div>

      {/* 결과 모달 */}
      {showResult && state.phase === 'finished' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="mx-4 p-6 rounded-2xl text-center max-w-sm w-full" style={{ background: 'var(--bg-card)', border: '2px solid var(--gold-mid)' }}>
            <p className="text-4xl mb-3">🚨</p>
            <h2 className="text-lg font-bold mb-2" style={{ color: '#e05050' }}>도둑 발견!</h2>
            <p className="text-xl font-bold mb-4" style={{ color: 'var(--gold-light)' }}>{getNickname(state.loser!)}</p>
            <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
              {state.loser === room.myEmail ? '당신이 도둑입니다... 😱' : '도둑이 잡혔습니다! 🎉'}
            </p>
            <div className="space-y-2">
              <button onClick={() => setShowResult(false)} className="w-full py-2.5 rounded-lg text-sm font-semibold"
                style={{ background: 'var(--gold-mid)', color: '#000', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                확인
              </button>
              <button onClick={() => router.push('/game')} className="w-full py-2.5 rounded-lg text-sm"
                style={{ background: 'var(--bg-base)', color: 'var(--text-muted)', border: '1px solid var(--border-dark)', cursor: 'pointer', fontFamily: 'inherit' }}>
                로비로 돌아가기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 턴 안내 */}
      {state.phase === 'playing' && (
        <div className="mb-4 p-3 rounded-xl text-center" style={{
          background: isMyTurn ? 'rgba(212,160,23,0.15)' : 'var(--bg-card)',
          border: isMyTurn ? '2px solid var(--gold-mid)' : '1px solid var(--border-dark)',
        }}>
          {isDrawPhase ? (
            <p className="text-sm font-bold" style={{ color: 'var(--gold-light)' }}>
              🎯 당신의 턴! {drawTarget ? `${getNickname(drawTarget)}의 카드를 뽑으세요` : ''}
            </p>
          ) : isDiscardPhase ? (
            <p className="text-sm font-bold" style={{ color: 'var(--gold-light)' }}>
              🃏 페어를 선택해서 버리세요! (같은 카드 2장을 탭)
            </p>
          ) : (
            <p className="text-sm" style={{ color: 'var(--text-sub)' }}>
              {currentPlayerName}의 턴...
            </p>
          )}
        </div>
      )}

      {state.phase === 'finished' && (
        <div className="mb-4 p-3 rounded-xl text-center" style={{ background: 'rgba(224,80,80,0.1)', border: '1px solid rgba(224,80,80,0.3)' }}>
          <p className="text-sm font-bold" style={{ color: '#e05050' }}>게임 종료! 도둑: {getNickname(state.loser!)}</p>
        </div>
      )}

      {/* 플레이어 그리드 */}
      <div className="mb-4">
        <div className="grid grid-cols-5 gap-2">
          {state.turnOrder.map((pid) => {
            const p = room.players.find(pl => pl.player_id === pid)
            const isEliminated = state.eliminatedPlayers.includes(pid)
            const isCurrentTurn = state.phase === 'playing' && pid === currentPlayer
            const isTarget = isDrawPhase && pid === drawTarget
            const cardCount = state.handCounts[pid] ?? 0
            const isLoser = state.phase === 'finished' && pid === state.loser
            const isMe = pid === room.myEmail

            return (
              <div key={pid} className="p-2 rounded-xl text-center relative" style={{
                background: isLoser ? 'rgba(224,80,80,0.15)' : isCurrentTurn ? 'rgba(212,160,23,0.12)' : isEliminated ? 'rgba(100,100,100,0.1)' : 'var(--bg-card)',
                border: isTarget ? '2px solid var(--gold-mid)' : isCurrentTurn ? '2px solid var(--gold-dark)' : '1px solid var(--border-dark)',
                opacity: isEliminated ? 0.5 : 1,
              }}>
                {isCurrentTurn && <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full animate-pulse" style={{ background: 'var(--gold-mid)' }} />}
                <p className="text-xs font-semibold truncate" style={{ color: isMe ? 'var(--gold-light)' : 'var(--text-main)' }}>
                  {p?.nickname ?? pid.slice(0, 6)}
                </p>
                <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {isLoser ? '🃏 도둑!' : isEliminated ? '✅ 탈출' : `${cardCount}장`}
                </p>
                {p?.is_ai === 1 && <span className="text-[9px]" style={{ color: '#ce93d8' }}>AI</span>}
              </div>
            )
          })}
        </div>
      </div>

      {/* 상대 카드 뽑기 UI — draw 페이즈에서만 */}
      {isDrawPhase && drawTarget && (state.handCounts[drawTarget] ?? 0) > 0 && (
        <div className="mb-4">
          <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-sub)' }}>
            {getNickname(drawTarget)}의 카드에서 한 장을 선택하세요
          </p>
          <div className="flex flex-wrap gap-2 justify-center">
            {Array.from({ length: state.handCounts[drawTarget] ?? 0 }).map((_, i) => (
              <PokerCardBack
                key={i}
                selected={selectedCard === i}
                onClick={() => setSelectedCard(selectedCard === i ? null : i)}
              />
            ))}
          </div>
          {/* 확인 버튼 */}
          <div className="flex justify-center mt-3">
            <button
              onClick={handleConfirmDraw}
              disabled={selectedCard === null || drawing}
              className="px-8 py-2.5 rounded-lg text-sm font-bold"
              style={{
                background: selectedCard !== null
                  ? 'linear-gradient(135deg, var(--gold-dark), var(--gold-mid))'
                  : 'var(--bg-base)',
                color: selectedCard !== null ? '#000' : 'var(--text-muted)',
                border: selectedCard !== null ? 'none' : '1px solid var(--border-dark)',
                cursor: selectedCard !== null && !drawing ? 'pointer' : 'default',
                fontFamily: 'inherit',
                opacity: drawing ? 0.5 : 1,
                transition: 'all 0.2s ease',
              }}
            >
              {drawing ? '뽑는 중...' : selectedCard !== null ? '이 카드 뽑기!' : '카드를 선택하세요'}
            </button>
          </div>
        </div>
      )}

      {/* 내 카드 */}
      {amIPlaying && (
        <div className="mb-4">
          <p className="text-xs font-semibold mb-2" style={{ color: 'var(--gold-mid)' }}>
            내 카드 ({state.myHand.length}장)
            {amIEliminated && <span style={{ color: '#81c784' }}> — 탈출 성공! 🎉</span>}
          </p>
          {state.myHand.length > 0 ? (
            <>
              <div className="flex flex-wrap gap-2">
                {state.myHand.map((card, i) => {
                  const canSelect = isDiscardPhase && pairableCards.has(card)
                  const isSelected = isDiscardPhase && selectedPairCard === card
                  return (
                    <button
                      key={`${card}-${i}`}
                      onClick={() => {
                        if (!canSelect) return
                        setSelectedPairCard(isSelected ? null : card)
                      }}
                      style={{
                        padding: 0, border: 'none', background: 'none', cursor: canSelect ? 'pointer' : 'default',
                        transition: 'transform 0.15s ease',
                        transform: isSelected ? 'translateY(-8px)' : 'none',
                        opacity: isDiscardPhase && !canSelect ? 0.4 : 1,
                        position: 'relative',
                        fontFamily: 'inherit',
                      }}
                    >
                      <PokerCard card={card} />
                      {isSelected && (
                        <div style={{
                          position: 'absolute', inset: -2, borderRadius: 8,
                          border: '2px solid var(--gold-mid)',
                          boxShadow: '0 0 12px rgba(212,160,23,0.5)',
                          pointerEvents: 'none',
                        }} />
                      )}
                    </button>
                  )
                })}
              </div>
              {/* 페어 버리기 / 패스 버튼 (discard 페이즈) */}
              {isDiscardPhase && (
                <div className="flex gap-2 justify-center mt-3">
                  <button
                    onClick={handleDiscardPair}
                    disabled={selectedPairCard === null || discarding}
                    className="px-6 py-2.5 rounded-lg text-sm font-bold"
                    style={{
                      background: selectedPairCard !== null
                        ? 'linear-gradient(135deg, var(--gold-dark), var(--gold-mid))'
                        : 'var(--bg-base)',
                      color: selectedPairCard !== null ? '#000' : 'var(--text-muted)',
                      border: selectedPairCard !== null ? 'none' : '1px solid var(--border-dark)',
                      cursor: selectedPairCard !== null && !discarding ? 'pointer' : 'default',
                      fontFamily: 'inherit', opacity: discarding ? 0.5 : 1,
                    }}
                  >
                    {discarding ? '버리는 중...' : selectedPairCard !== null ? `${getCardRank(selectedPairCard)}${getCardSuit(selectedPairCard)} 페어 버리기` : '카드를 선택하세요'}
                  </button>
                  {pairableCards.size === 0 && (
                    <button
                      onClick={handlePass}
                      className="px-4 py-2.5 rounded-lg text-sm"
                      style={{
                        background: 'var(--bg-base)', color: 'var(--text-muted)',
                        border: '1px solid var(--border-dark)', cursor: 'pointer', fontFamily: 'inherit',
                      }}
                    >
                      패스 (턴 종료)
                    </button>
                  )}
                </div>
              )}
            </>
          ) : (
            !amIEliminated && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>카드 없음</p>
          )}
        </div>
      )}

      {/* 액션 로그 */}
      <div className="rounded-xl p-3" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-dark)', maxHeight: '160px', overflowY: 'auto' }}>
        <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-sub)' }}>게임 로그</p>
        {actionLog.length === 0 ? (
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>아직 진행된 액션이 없습니다</p>
        ) : (
          <div className="space-y-1">
            {actionLog.map((log, i) => (
              <p key={i} className="text-xs" style={{ color: i === 0 ? 'var(--text-main)' : 'var(--text-muted)', fontWeight: i === 0 ? 600 : 400 }}>
                {log}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════
// 메인 페이지 (라우터)
// ═══════════════════════════════════════════
// ═══════════════════════════════════════════
// 게임 허브 (게임 선택 화면)
// ═══════════════════════════════════════════
function GameHub() {
  const router = useRouter()
  const adminRole = typeof window !== 'undefined' ? localStorage.getItem('admin_role') : null
  const isAdmin = adminRole === 'super' || adminRole === 'admin'

  const games = [
    {
      id: 'thief',
      name: '도둑잡기',
      emoji: '🃏',
      description: '조커를 마지막까지 들고 있는 사람이 도둑!',
      color: '#e05050',
      onClick: () => router.push('/game?mode=thief'),
    },
    {
      id: 'marble',
      name: '구슬치기',
      emoji: '🔮',
      description: '구슬을 튕겨 상대를 밀어내고 배팅한 구슬을 가져가라!',
      color: '#7ec8e3',
      onClick: () => router.push('/marble'),
    },
    ...(isAdmin ? [{
      id: 'rpg',
      name: '성심당 RPG',
      emoji: '🏰',
      description: '판타지 마을을 탐험하고 멤버들과 대화하자!',
      color: '#c8a84e',
      onClick: () => router.push('/rpg'),
    }] : []),
  ]

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 pb-24">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--gold-light)' }}>게임</h1>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>성심당 멤버들과 함께 즐기세요!</p>
      </div>

      <div className="space-y-3">
        {games.map(g => (
          <button
            key={g.id}
            onClick={g.onClick}
            className="w-full p-5 rounded-xl flex items-center gap-4 text-left"
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-dark)',
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'border-color 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--border-gold)')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-dark)')}
          >
            <span className="text-3xl">{g.emoji}</span>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-bold mb-0.5" style={{ color: g.color }}>{g.name}</h2>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{g.description}</p>
            </div>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: 20, height: 20, color: 'var(--text-muted)', flexShrink: 0 }}>
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        ))}
      </div>
    </div>
  )
}

function GamePageInner() {
  const searchParams = useSearchParams()
  const roomId = searchParams.get('room')
  const mode = searchParams.get('mode')

  if (roomId) return <GameRoom roomId={roomId} />
  if (mode === 'thief') return <Lobby />
  return <GameHub />
}

export default function GamePage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-[50vh]"><p style={{ color: 'var(--text-muted)' }}>로딩 중...</p></div>}>
      <GamePageInner />
    </Suspense>
  )
}
