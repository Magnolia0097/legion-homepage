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
  created_at: string
}

export interface Member {
  id: number
  nickname: string
  role: string
  joined_at: string | null
  is_active: number
}

export interface GalleryDate {
  taken_date: string
}
