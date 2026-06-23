import type { Notice, Photo, Member, GalleryMonth, Event, EventDetail, User, Comment, InviteToken } from '@/types'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787'
// 빌드 타임 검증: 프로덕션에서 localhost가 들어오면 즉시 에러
if (typeof window !== 'undefined' && API_BASE.includes('localhost') && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
  console.error('[api] NEXT_PUBLIC_API_URL이 localhost로 설정되어 있습니다. npm run deploy를 사용하세요.')
}
const R2_BASE = process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? ''

function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('firebase_token')
}

// 브라우저/CDN 캐시를 완전히 우회하는 공개 GET 전용 fetch
async function fetchNoCache(url: string): Promise<Response> {
  return fetch(url, { cache: 'no-store' })
}

async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  const token = getToken()
  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })
}

// 이미지 URL 조합
export function getImageUrl(fileKey: string): string {
  return `${R2_BASE}/${fileKey}`
}

// ─── 공지사항 ───
export const noticeApi = {
  getAll: (): Promise<Notice[]> =>
    fetchNoCache(`${API_BASE}/api/notices`).then((r) => r.json()),

  getOne: (id: number): Promise<Notice> =>
    fetchNoCache(`${API_BASE}/api/notices/${id}`).then((r) => r.json()),

  create: (data: Pick<Notice, 'title' | 'content' | 'author' | 'is_pinned'>): Promise<Response> =>
    fetchWithAuth(`${API_BASE}/api/notices`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (
    id: number,
    data: Pick<Notice, 'title' | 'content' | 'is_pinned'>
  ): Promise<Response> =>
    fetchWithAuth(`${API_BASE}/api/notices/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (id: number): Promise<Response> =>
    fetchWithAuth(`${API_BASE}/api/notices/${id}`, { method: 'DELETE' }),

  uploadMusic: (id: number, formData: FormData): Promise<Response> => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('firebase_token') : null
    return fetch(`${API_BASE}/api/notices/${id}/music`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    })
  },

  deleteMusic: (id: number): Promise<Response> =>
    fetchWithAuth(`${API_BASE}/api/notices/${id}/music`, { method: 'DELETE' }),
}

// ─── 사진첩 ───
export const galleryApi = {
  // 연/월 그룹 목록 조회
  getMonths: (): Promise<GalleryMonth[]> =>
    fetchNoCache(`${API_BASE}/api/gallery`).then((r) => r.json()),

  // 특정 연/월 사진 목록 (YYYY-MM)
  getByMonth: (yearMonth: string): Promise<Photo[]> =>
    fetchNoCache(`${API_BASE}/api/gallery/${yearMonth}`).then((r) => r.json()),

  // 특정 월 업로드 수 조회 (관리자용)
  getMonthCount: (yearMonth: string): Promise<{ count: number; limit: number }> => {
    const token = getToken()
    return fetch(`${API_BASE}/api/gallery/${yearMonth}/count`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }).then((r) => r.json())
  },

  upload: (formData: FormData): Promise<Response> => {
    const token = getToken()
    return fetch(`${API_BASE}/api/gallery/upload`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    })
  },

  delete: (id: number): Promise<Response> =>
    fetchWithAuth(`${API_BASE}/api/gallery/${id}`, { method: 'DELETE' }),

  // 이달의 모델 최신 1개 (홈 히어로용)
  getFeatured: (): Promise<import('@/types').Photo | null> =>
    fetchNoCache(`${API_BASE}/api/gallery/featured`).then((r) => r.json()),

  // 역대 이달의 모델 전체 (최고관리자용)
  getAllFeatured: (): Promise<import('@/types').Photo[]> =>
    fetchWithAuth(`${API_BASE}/api/gallery/featured/all`).then((r) => r.json()),

  // 갤러리 사진 업로드 (이달의 모델 포함 통합)
  uploadFull: (formData: FormData): Promise<Response> => {
    const token = getToken()
    return fetch(`${API_BASE}/api/gallery/upload`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    })
  },
}

// ─── 갤러리 좋아요 ───
export const likeApi = {
  get: (photoId: number): Promise<{ count: number; liked: boolean }> =>
    fetchWithAuth(`${API_BASE}/api/gallery/${photoId}/likes`).then((r) => r.json()),

  toggle: (photoId: number): Promise<{ count: number; liked: boolean }> =>
    fetchWithAuth(`${API_BASE}/api/gallery/${photoId}/likes`, { method: 'POST' }).then((r) => r.json()),
}

// ─── 멤버 ───
export const memberApi = {
  getAll: (): Promise<Member[]> =>
    fetchNoCache(`${API_BASE}/api/members`).then((r) => r.json()),

  create: (data: Pick<Member, 'nickname' | 'role' | 'bio'>): Promise<Response> =>
    fetchWithAuth(`${API_BASE}/api/members`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: number, data: Pick<Member, 'nickname' | 'role' | 'bio'>): Promise<Response> =>
    fetchWithAuth(`${API_BASE}/api/members/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (id: number): Promise<Response> =>
    fetchWithAuth(`${API_BASE}/api/members/${id}`, { method: 'DELETE' }),
}

// ─── 이벤트 ───
export const eventApi = {
  getAll: (): Promise<Event[]> =>
    fetchNoCache(`${API_BASE}/api/events`).then((r) => r.json()),

  getOne: (id: number): Promise<EventDetail> =>
    fetchNoCache(`${API_BASE}/api/events/${id}`).then((r) => r.json()),

  create: (data: { title: string; content: string; end_date?: string | null }): Promise<Response> =>
    fetchWithAuth(`${API_BASE}/api/events`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: number, data: { title: string; content: string; end_date?: string | null }): Promise<Response> =>
    fetchWithAuth(`${API_BASE}/api/events/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  toggleStatus: (id: number): Promise<{ status: string }> =>
    fetchWithAuth(`${API_BASE}/api/events/${id}/status`, {
      method: 'PATCH',
    }).then((r) => r.json()),

  delete: (id: number): Promise<Response> =>
    fetchWithAuth(`${API_BASE}/api/events/${id}`, { method: 'DELETE' }),

  uploadPhoto: (eventId: number, formData: FormData): Promise<Response> => {
    const token = getToken()
    return fetch(`${API_BASE}/api/events/${eventId}/photos`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    })
  },

  deletePhoto: (eventId: number, photoId: number): Promise<Response> =>
    fetchWithAuth(`${API_BASE}/api/events/${eventId}/photos/${photoId}`, { method: 'DELETE' }),

  reorderPhotos: (eventId: number, orderedIds: number[]): Promise<Response> =>
    fetchWithAuth(`${API_BASE}/api/events/${eventId}/photos/reorder`, {
      method: 'PATCH',
      body: JSON.stringify({ orderedIds }),
    }),

  uploadMusic: (id: number, formData: FormData): Promise<Response> => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('firebase_token') : null
    return fetch(`${API_BASE}/api/events/${id}/music`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    })
  },

  deleteMusic: (id: number): Promise<Response> =>
    fetchWithAuth(`${API_BASE}/api/events/${id}/music`, { method: 'DELETE' }),
}

// ─── 관리자 계정 관리 ───
export interface AdminAccount {
  id: number
  email: string
  added_by: string | null
  created_at: string
  permissions: string  // JSON 문자열, e.g. '["notice","gallery","event","member"]'
  nickname: string
}

export const ADMIN_PERMISSION_LABELS: Record<string, string> = {
  notice: '공지사항',
  gallery: '사진첩',
  event: '이벤트',
  member: '멤버 소개',
}

export const adminAccountsApi = {
  getAll: (): Promise<AdminAccount[]> =>
    fetchWithAuth(`${API_BASE}/api/admin-accounts`).then((r) => r.json()),

  create: (email: string): Promise<Response> =>
    fetchWithAuth(`${API_BASE}/api/admin-accounts`, {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  updatePermissions: (id: number, permissions: string[]): Promise<Response> =>
    fetchWithAuth(`${API_BASE}/api/admin-accounts/${id}/permissions`, {
      method: 'PATCH',
      body: JSON.stringify({ permissions }),
    }),

  updateNickname: (id: number, nickname: string): Promise<Response> =>
    fetchWithAuth(`${API_BASE}/api/admin-accounts/${id}/nickname`, {
      method: 'PATCH',
      body: JSON.stringify({ nickname }),
    }),

  delete: (id: number): Promise<Response> =>
    fetchWithAuth(`${API_BASE}/api/admin-accounts/${id}`, { method: 'DELETE' }),
}

// ─── 인증 검증 ───
export const authApi = {
  verify: (): Promise<{
    valid: boolean
    email: string
    isAdmin: boolean
    isSuperAdmin: boolean
    permissions: string[]
    nickname: string
    isUser: boolean
    userNickname: string
  }> =>
    fetchWithAuth(`${API_BASE}/api/auth/verify`, { method: 'POST' }).then((r) => r.json()),

  updateOwnNickname: (nickname: string): Promise<Response> =>
    fetchWithAuth(`${API_BASE}/api/auth/nickname`, {
      method: 'PATCH',
      body: JSON.stringify({ nickname }),
    }),
}

// ─── 멤버 소개 수정 (일반 관리자용) ───
export const memberBioApi = {
  update: (id: number, bio: string): Promise<Response> =>
    fetchWithAuth(`${API_BASE}/api/members/${id}/bio`, {
      method: 'PATCH',
      body: JSON.stringify({ bio }),
    }),
}

// ─── 관리자 활동 로그 ───
export interface AdminLog {
  id: number
  admin_email: string
  admin_nickname: string | null
  action: 'create' | 'update' | 'delete' | 'patch'
  target_type: 'notice' | 'event' | 'event_photo' | 'member' | 'gallery' | 'admin_account'
  target_id: number | null
  detail: string | null
  created_at: string
}

export const adminLogsApi = {
  getAll: (limit = 200): Promise<AdminLog[]> =>
    fetchWithAuth(`${API_BASE}/api/admin-logs?limit=${limit}`).then((r) => r.json()),
}

// ─── 일반 사용자 관리 (최고 관리자 전용) ───
export const usersApi = {
  getAll: (): Promise<User[]> =>
    fetchWithAuth(`${API_BASE}/api/users`).then((r) => r.json()),

  create: (email: string, nickname: string): Promise<Response> =>
    fetchWithAuth(`${API_BASE}/api/users`, {
      method: 'POST',
      body: JSON.stringify({ email, nickname }),
    }),

  updateNickname: (id: number, nickname: string): Promise<Response> =>
    fetchWithAuth(`${API_BASE}/api/users/${id}/nickname`, {
      method: 'PATCH',
      body: JSON.stringify({ nickname }),
    }),

  delete: (id: number): Promise<Response> =>
    fetchWithAuth(`${API_BASE}/api/users/${id}`, { method: 'DELETE' }),
}

// ─── 댓글 ───
export const commentApi = {
  getAll: (targetType: 'notice' | 'event' | 'gallery', targetId: number): Promise<Comment[]> =>
    fetchNoCache(`${API_BASE}/api/comments/${targetType}/${targetId}`).then((r) => r.json()),

  create: (targetType: 'notice' | 'event' | 'gallery', targetId: number, content: string): Promise<Response> =>
    fetchWithAuth(`${API_BASE}/api/comments/${targetType}/${targetId}`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),

  delete: (id: number): Promise<Response> =>
    fetchWithAuth(`${API_BASE}/api/comments/${id}`, { method: 'DELETE' }),
}

// ─── 사이트 설정 (가입조건/가입방법/이달의모델) ───
export interface SiteSettings {
  join_conditions: string
  join_method: string
  hero_enabled: string
}

export const siteSettingsApi = {
  get: (): Promise<SiteSettings> =>
    fetchNoCache(`${API_BASE}/api/site-settings`).then((r) => r.json()),

  update: (data: Partial<SiteSettings>): Promise<Response> =>
    fetchWithAuth(`${API_BASE}/api/site-settings`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
}

// ─── 초대 링크 ───
export const inviteApi = {
  create: (type: 'user' | 'admin', mode: 'single' | 'period', expiresIn?: number): Promise<{ token: string }> =>
    fetchWithAuth(`${API_BASE}/api/invite`, {
      method: 'POST',
      body: JSON.stringify({ type, mode, expires_in: expiresIn }),
    }).then((r) => r.json()),

  list: (): Promise<InviteToken[]> =>
    fetchWithAuth(`${API_BASE}/api/invite/list`).then((r) => r.json()),

  loginLogs: (): Promise<User[]> =>
    fetchWithAuth(`${API_BASE}/api/invite/login-logs`).then((r) => r.json()),

  getInfo: (token: string): Promise<{ valid: boolean; type?: 'user' | 'admin'; error?: string }> =>
    fetch(`${API_BASE}/api/invite/${token}`).then((r) => r.json()),

  use: (token: string, nickname: string): Promise<{ success?: boolean; type?: string; error?: string }> =>
    fetchWithAuth(`${API_BASE}/api/invite/${token}/use`, {
      method: 'POST',
      body: JSON.stringify({ nickname }),
    }).then((r) => r.json()),

  delete: (token: string): Promise<Response> =>
    fetchWithAuth(`${API_BASE}/api/invite/${token}`, { method: 'DELETE' }),
}

// ─── 도둑잡기 게임 ───
export const gameApi = {
  getRooms: (): Promise<any[]> =>
    fetchNoCache(`${API_BASE}/api/game`).then((r) => r.json()),

  createRoom: (maxPlayers: number): Promise<{ roomId: string }> =>
    fetchWithAuth(`${API_BASE}/api/game`, {
      method: 'POST',
      body: JSON.stringify({ maxPlayers }),
    }).then((r) => r.json()),

  getRoom: (roomId: string): Promise<any> =>
    fetchWithAuth(`${API_BASE}/api/game/${roomId}`, { method: 'GET' }).then((r) => r.json()),

  joinRoom: (roomId: string): Promise<any> =>
    fetchWithAuth(`${API_BASE}/api/game/${roomId}/join`, { method: 'POST' }).then((r) => r.json()),

  addAi: (roomId: string): Promise<any> =>
    fetchWithAuth(`${API_BASE}/api/game/${roomId}/add-ai`, { method: 'POST' }).then((r) => r.json()),

  removeAi: (roomId: string, aiId: string): Promise<any> =>
    fetchWithAuth(`${API_BASE}/api/game/${roomId}/remove-ai/${aiId}`, { method: 'DELETE' }).then((r) => r.json()),

  startGame: (roomId: string): Promise<any> =>
    fetchWithAuth(`${API_BASE}/api/game/${roomId}/start`, { method: 'POST' }).then((r) => r.json()),

  drawCard: (roomId: string, position: number): Promise<any> =>
    fetchWithAuth(`${API_BASE}/api/game/${roomId}/draw`, {
      method: 'POST',
      body: JSON.stringify({ position }),
    }).then((r) => r.json()),

  discardPair: (roomId: string, card: number): Promise<any> =>
    fetchWithAuth(`${API_BASE}/api/game/${roomId}/discard`, {
      method: 'POST',
      body: JSON.stringify({ card }),
    }).then((r) => r.json()),

  passTurn: (roomId: string): Promise<any> =>
    fetchWithAuth(`${API_BASE}/api/game/${roomId}/pass`, { method: 'POST' }).then((r) => r.json()),

  leaveRoom: (roomId: string): Promise<any> =>
    fetchWithAuth(`${API_BASE}/api/game/${roomId}/leave`, { method: 'POST' }).then((r) => r.json()),

  deleteRoom: (roomId: string): Promise<any> =>
    fetchWithAuth(`${API_BASE}/api/game/${roomId}`, { method: 'DELETE' }).then((r) => r.json()),
}

// ─── 구슬치기 API ───
export const marbleApi = {
  getTypes: (): Promise<any> =>
    fetchNoCache(`${API_BASE}/api/marble/types`).then((r) => r.json()),

  getInventory: (): Promise<any[]> =>
    fetchWithAuth(`${API_BASE}/api/marble/inventory`, { method: 'GET' }).then((r) => r.json()),

  getRooms: (): Promise<any[]> =>
    fetchNoCache(`${API_BASE}/api/marble/rooms`).then((r) => r.json()),

  createRoom: (maxPlayers: number, betAmount: number, marbleType: string): Promise<{ roomId: string }> =>
    fetchWithAuth(`${API_BASE}/api/marble/rooms`, {
      method: 'POST',
      body: JSON.stringify({ maxPlayers, betAmount, marbleType }),
    }).then((r) => r.json()),

  getRoom: (roomId: string): Promise<any> =>
    fetchWithAuth(`${API_BASE}/api/marble/rooms/${roomId}`, { method: 'GET' }).then((r) => r.json()),

  joinRoom: (roomId: string, marbleType: string): Promise<any> =>
    fetchWithAuth(`${API_BASE}/api/marble/rooms/${roomId}/join`, {
      method: 'POST',
      body: JSON.stringify({ marbleType }),
    }).then((r) => r.json()),

  addAi: (roomId: string): Promise<any> =>
    fetchWithAuth(`${API_BASE}/api/marble/rooms/${roomId}/add-ai`, { method: 'POST' }).then((r) => r.json()),

  removeAi: (roomId: string, aiId: string): Promise<any> =>
    fetchWithAuth(`${API_BASE}/api/marble/rooms/${roomId}/remove-ai/${aiId}`, { method: 'DELETE' }).then((r) => r.json()),

  startGame: (roomId: string): Promise<any> =>
    fetchWithAuth(`${API_BASE}/api/marble/rooms/${roomId}/start`, { method: 'POST' }).then((r) => r.json()),

  shoot: (roomId: string, angle: number, power: number): Promise<any> =>
    fetchWithAuth(`${API_BASE}/api/marble/rooms/${roomId}/shoot`, {
      method: 'POST',
      body: JSON.stringify({ angle, power }),
    }).then((r) => r.json()),

  leaveRoom: (roomId: string): Promise<any> =>
    fetchWithAuth(`${API_BASE}/api/marble/rooms/${roomId}/leave`, { method: 'POST' }).then((r) => r.json()),

  getRanking: (): Promise<any[]> =>
    fetchNoCache(`${API_BASE}/api/marble/ranking`).then((r) => r.json()),
}

// ─── 인증 검증 (확장) ───
// ─── RPG API ───
export const rpgApi = {
  syncPosition: async (pos: { mapId: string; tileX: number; tileY: number; direction: number }) => {
    const res = await fetchWithAuth(`${API_BASE}/api/rpg/position`, {
      method: 'POST',
      body: JSON.stringify(pos),
    })
    return res.json()
  },
  saveGame: async (saveData: unknown) => {
    const res = await fetchWithAuth(`${API_BASE}/api/rpg/save`, {
      method: 'POST',
      body: JSON.stringify(saveData),
    })
    return res.json()
  },
  loadGame: async () => {
    const res = await fetchWithAuth(`${API_BASE}/api/rpg/save`)
    return res.json()
  },
  getOnlineCount: async () => {
    const res = await fetchNoCache(`${API_BASE}/api/rpg/online`)
    return res.json()
  },
}

export interface VerifyResult {
  valid: boolean
  email: string
  isAdmin: boolean
  isSuperAdmin: boolean
  permissions: string[]
  nickname: string
  isUser: boolean
  userNickname: string
}
