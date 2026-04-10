export interface Notice {
  id: number
  title: string
  content: string
  author: string
  is_pinned: number
  music_key: string | null
  view_count: number
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
  bio: string | null
  joined_at: string | null
  is_active: number
}

export interface GalleryMonth {
  year_month: string
  count: number
  thumbnail_key: string | null
  has_featured: number
}

export interface Event {
  id: number
  title: string
  content: string
  author: string
  status: 'active' | 'ended'
  thumbnail_key: string | null
  music_key: string | null
  view_count: number
  end_date: string | null
  photo_count: number
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

export interface EventDetail extends Omit<Event, 'thumbnail_key' | 'photo_count'> {
  photos: EventPhoto[]
}

export interface User {
  id: number
  email: string
  nickname: string
  added_by: string
  first_login_at: string | null
  invite_token: string | null
  created_at: string
}

export interface InviteToken {
  id: number
  token: string
  type: 'user' | 'admin'
  mode: 'single' | 'period'
  created_by: string
  used_by: string | null
  used_at: string | null
  created_at: string
  expires_at: string | null
}

export interface Comment {
  id: number
  author_nickname: string
  content: string
  created_at: string
}
