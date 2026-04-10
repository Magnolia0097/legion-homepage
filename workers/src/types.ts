// Hono 컨텍스트 변수 (미들웨어 → 라우트 이메일 전달)
export interface Variables {
  adminEmail: string
  userEmail: string
  userNickname: string
}

export interface Env {
  DB: D1Database
  BUCKET: R2Bucket
  AI: Ai
  FIREBASE_PROJECT_ID: string
  SUPER_ADMIN_EMAILS: string
  RESEND_API_KEY?: string
  RESEND_FROM_EMAIL?: string
}

export interface Notice {
  id: number
  title: string
  content: string
  author: string
  is_pinned: number
  created_at: string
  updated_at: string
}

export interface Photo {
  id: number
  file_key: string
  description: string | null
  taken_date: string
  uploader: string
  is_featured: number
  music_key: string | null
  hero_title: string | null
  hero_desc: string | null
  created_at: string
}

export interface Member {
  id: number
  nickname: string
  role: string
  joined_at: string | null
  is_active: number
}

export interface Event {
  id: number
  title: string
  content: string
  author: string
  status: 'active' | 'ended'
  thumbnail_key: string | null
  created_at: string
  updated_at: string
}

export interface EventPhoto {
  id: number
  event_id: number
  file_key: string
  sort_order: number
  created_at: string
}

export interface User {
  id: number
  email: string
  nickname: string
  added_by: string
  created_at: string
}

export interface Comment {
  id: number
  target_type: 'notice' | 'event' | 'gallery'
  target_id: number
  author_email: string
  author_nickname: string
  content: string
  created_at: string
}
