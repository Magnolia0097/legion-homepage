// ============================================================
// 성심당 도트 RPG — Backend API
// Endpoints: position sync, save/load game state
// ============================================================

import { Hono } from 'hono'
import type { Env, Variables } from '../types'
import { requireSuperAdmin } from '../middleware/admin'

const rpg = new Hono<{ Bindings: Env; Variables: Variables }>()

// 모든 RPG 엔드포인트는 최고 관리자만 접근 가능
rpg.use('/*', requireSuperAdmin)

// ── Position Sync (Multiplayer Ghost System) ─────────────────
// POST /position — Send my position, get others' positions

rpg.post('/position', async (c) => {
  const email = c.get('adminEmail') as string
  const nickname = email.split('@')[0]
  const { mapId, tileX, tileY, direction } = await c.req.json<{
    mapId: string; tileX: number; tileY: number; direction: number
  }>()

  // Upsert my position
  await c.env.DB.prepare(`
    INSERT INTO rpg_positions (email, nickname, map_id, tile_x, tile_y, direction, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(email) DO UPDATE SET
      nickname = excluded.nickname,
      map_id = excluded.map_id,
      tile_x = excluded.tile_x,
      tile_y = excluded.tile_y,
      direction = excluded.direction,
      updated_at = datetime('now')
  `).bind(email, nickname, mapId, tileX, tileY, direction).run()

  // Get others' positions (active in last 30 seconds)
  const others = await c.env.DB.prepare(`
    SELECT email, nickname, map_id as mapId, tile_x as tileX, tile_y as tileY, direction
    FROM rpg_positions
    WHERE email != ? AND updated_at > datetime('now', '-30 seconds')
  `).bind(email).all()

  return c.json({ others: others.results })
})

// ── Save Game State ──────────────────────────────────────────
// POST /save — Save player's game progress

rpg.post('/save', async (c) => {
  const email = c.get('adminEmail') as string
  const saveData = await c.req.json()

  await c.env.DB.prepare(`
    INSERT INTO rpg_saves (email, save_data, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(email) DO UPDATE SET
      save_data = excluded.save_data,
      updated_at = datetime('now')
  `).bind(email, JSON.stringify(saveData)).run()

  return c.json({ success: true })
})

// ── Load Game State ──────────────────────────────────────────
// GET /save — Load player's game progress

rpg.get('/save', async (c) => {
  const email = c.get('adminEmail') as string

  const row = await c.env.DB.prepare(`
    SELECT save_data FROM rpg_saves WHERE email = ?
  `).bind(email).first<{ save_data: string }>()

  if (!row) {
    return c.json({ save: null })
  }

  try {
    return c.json({ save: JSON.parse(row.save_data) })
  } catch {
    return c.json({ save: null })
  }
})

// ── Online Players Count ─────────────────────────────────────
// GET /online — How many players are currently online

rpg.get('/online', async (c) => {
  const result = await c.env.DB.prepare(`
    SELECT COUNT(*) as count FROM rpg_positions
    WHERE updated_at > datetime('now', '-30 seconds')
  `).first<{ count: number }>()

  return c.json({ online: result?.count ?? 0 })
})

// ── AI NPC Chat ──────────────────────────────────────────────
// POST /npc-chat — Generate AI-powered NPC dialogue
// 일일 50회 제한 (무료 한도 보호), 초과 시 고정 대사 반환

const DAILY_AI_LIMIT = 50 // 하루 최대 AI 대화 생성 횟수
const aiUsageCache = new Map<string, { count: number; resetAt: number }>()

function checkAiLimit(): { allowed: boolean; remaining: number } {
  const key = 'global'
  const now = Date.now()
  const entry = aiUsageCache.get(key)

  if (!entry || now > entry.resetAt) {
    // 자정 기준으로 리셋 (UTC)
    const tomorrow = new Date()
    tomorrow.setUTCHours(24, 0, 0, 0)
    aiUsageCache.set(key, { count: 1, resetAt: tomorrow.getTime() })
    return { allowed: true, remaining: DAILY_AI_LIMIT - 1 }
  }

  if (entry.count >= DAILY_AI_LIMIT) {
    return { allowed: false, remaining: 0 }
  }

  entry.count++
  return { allowed: true, remaining: DAILY_AI_LIMIT - entry.count }
}

// NPC별 고정 폴백 대사 (AI 한도 초과 시 사용)
const FALLBACK_DIALOGUES: Record<string, string[]> = {
  chan: [
    '오늘도 평화로운 하루구나... 성심당은 언제나 따뜻해.',
    '우리 멤버들 보면 항상 감동이야... 눈물이 날 것 같아.',
    '군단장이라고 하기엔 좀 약하지만... 그래도 최선을 다하고 있어!',
  ],
  ssimdanghilbbang: [
    '오늘도 힐링 스킬 연마 중~ 다친 곳은 없나?',
    '성심당의 든든한 힐러가 되어줄게!',
    '좋은 하루 보내고 있지? 파이팅!',
  ],
  jonguri: [
    '루드라와 1:1 했는데 이겼어... 진짜야 진짜!',
    '아 귀찮다... 근데 게임은 해야지.',
    '숲 속에 뭔가 숨겨져 있는 것 같은데...',
  ],
  jealousmask: [
    '마스크를 쓰고 다니는 이유? 비밀이야.',
    '오늘 뭐 좀 재밌는 거 없나?',
    '시장 거리에 새로운 물건이 들어왔다던데.',
  ],
  candy: [
    '안녕~ 사탕 줄까? 아 근데 지금 없어 ㅋㅋ',
    '여기 꽃밭이 예쁘지? 오늘도 즐겁게 놀자~',
    '달콤한 하루가 되길 바라!',
  ],
  irin: [
    '...*고개를 끄덕인다*',
    '여기가 좋아... 조용하거든.',
    '길드 창고에 새로운 사진이 올라왔어.',
  ],
  jujang: [
    '오! 드디어 왔구나! 같이 모험하자!',
    '이 마을 최고의 장소? 당연히 성심당 본부지!',
    '가끔 숲에서 이상한 소리가 들리는 것 같아...',
  ],
  jinny: [
    '소원을 말해봐~ 라고 하고 싶지만 나는 램프 지니가 아니야 ㅋㅋ',
    '마을 곳곳에 숨겨진 아이템이 있다던데!',
    '오늘 날씨 진짜 좋다~ 산책하기 딱이야!',
  ],
  claire: [
    '여기 경치가 참 좋아... 특히 해질 무렵이.',
    '시장에 좋은 물건이 있으면 알려줄게~',
    '오늘도 멋진 하루 보내자!',
  ],
}

rpg.post('/npc-chat', async (c) => {
  const { npcId, npcNickname, npcRole, npcBio, playerName } = await c.req.json<{
    npcId: string
    npcNickname: string
    npcRole: string
    npcBio: string
    playerName: string
  }>()

  // 일일 한도 확인
  const limit = checkAiLimit()
  if (!limit.allowed) {
    // 한도 초과 → 고정 대사 반환
    const fallbacks = FALLBACK_DIALOGUES[npcId] || ['안녕! 오늘도 좋은 하루야~']
    const line = fallbacks[Math.floor(Math.random() * fallbacks.length)]
    return c.json({ line, ai: false, remaining: 0 })
  }

  try {
    const systemPrompt = `너는 "${npcNickname}"이라는 캐릭터야. 성심당이라는 아이온2 게임 길드의 ${npcRole}이야.

아래는 너의 성격과 특징이야:
${npcBio}

규칙:
- 반드시 한국어로 답해
- 1~2문장으로 짧게 답해 (RPG 대화창에 들어갈 분량)
- 캐릭터의 성격과 말투를 반영해서 자연스럽게 말해
- 게임 속 판타지 마을에서 대화하는 상황이야
- 절대 자기 소개를 반복하지 마, 마치 오래 알던 사이처럼 말해
- "나는 ~입니다" 같은 자기소개는 하지 마
- 가볍고 재미있는 톤으로`

    const userMessage = `${playerName}이(가) 너에게 말을 걸었어. 자연스럽게 한마디 해줘.`

    const result = await c.env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      max_tokens: 100,
      temperature: 0.8,
    }) as { response?: string }

    const line = result.response?.trim() || null
    if (!line) throw new Error('Empty response')

    return c.json({ line, ai: true, remaining: limit.remaining })
  } catch (err) {
    // AI 실패 → 고정 대사
    const fallbacks = FALLBACK_DIALOGUES[npcId] || ['안녕! 오늘도 좋은 하루야~']
    const line = fallbacks[Math.floor(Math.random() * fallbacks.length)]
    return c.json({ line, ai: false, remaining: limit.remaining })
  }
})

export default rpg
