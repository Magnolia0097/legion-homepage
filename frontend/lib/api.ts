import type { Notice, Photo, Member, GalleryDate } from '@/types'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787'
const R2_BASE = process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? ''

function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('firebase_token')
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
    fetch(`${API_BASE}/api/notices`).then((r) => r.json()),

  getOne: (id: number): Promise<Notice> =>
    fetch(`${API_BASE}/api/notices/${id}`).then((r) => r.json()),

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
}

// ─── 사진첩 ───
export const galleryApi = {
  getDates: (): Promise<GalleryDate[]> =>
    fetch(`${API_BASE}/api/gallery`).then((r) => r.json()),

  getByDate: (date: string): Promise<Photo[]> =>
    fetch(`${API_BASE}/api/gallery/${date}`).then((r) => r.json()),

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
}

// ─── 멤버 ───
export const memberApi = {
  getAll: (): Promise<Member[]> =>
    fetch(`${API_BASE}/api/members`).then((r) => r.json()),
}

// ─── 인증 검증 ───
export const authApi = {
  verify: (): Promise<{ valid: boolean; email: string; isAdmin: boolean }> =>
    fetchWithAuth(`${API_BASE}/api/auth/verify`, { method: 'POST' }).then((r) => r.json()),
}
