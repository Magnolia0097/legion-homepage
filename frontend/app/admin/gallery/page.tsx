'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { galleryApi } from '@/lib/api'
import { getStoredToken } from '@/lib/firebase'
import PhotoCard from '@/components/PhotoCard'
import type { Photo } from '@/types'

const inputStyle: React.CSSProperties = {
  background: 'var(--bg-base)',
  color: 'var(--text-main)',
  border: '1px solid var(--border-gold)',
  borderRadius: '6px',
  padding: '8px 14px',
  fontSize: '14px',
  width: '100%',
  fontFamily: 'inherit',
}

const primaryBtnStyle: React.CSSProperties = {
  background: 'var(--gold-mid)',
  color: 'var(--bg-base)',
  fontWeight: '700',
  padding: '8px 24px',
  borderRadius: '6px',
  border: 'none',
  cursor: 'pointer',
  fontSize: '14px',
  fontFamily: 'inherit',
}

export default function AdminGalleryPage() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [dates, setDates] = useState<string[]>([])
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [photos, setPhotos] = useState<Photo[]>([])
  const [takenDate, setTakenDate] = useState('')
  const [description, setDescription] = useState('')
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!getStoredToken()) {
      router.push('/admin/login')
      return
    }
    loadDates()
  }, [])

  async function loadDates() {
    const data = await galleryApi.getDates()
    setDates(data.map((d) => d.taken_date))
  }

  async function loadPhotos(date: string) {
    setSelectedDate(date)
    const data = await galleryApi.getByDate(date)
    setPhotos(data)
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault()
    const file = fileRef.current?.files?.[0]
    if (!file || !takenDate) {
      setMessage('파일과 날짜를 입력해주세요.')
      return
    }
    setUploading(true)
    setMessage(null)
    try {
      const webpBlob = await convertToWebP(file)
      const formData = new FormData()
      formData.append('file', webpBlob, 'photo.webp')
      formData.append('taken_date', takenDate)
      formData.append('description', description)
      formData.append('uploader', '관리자')
      const res = await galleryApi.upload(formData)
      if (res.ok) {
        setMessage('업로드 완료!')
        setDescription('')
        if (fileRef.current) fileRef.current.value = ''
        await loadDates()
        if (selectedDate === takenDate) await loadPhotos(takenDate)
      } else {
        setMessage('업로드 실패')
      }
    } catch {
      setMessage('오류가 발생했습니다.')
    } finally {
      setUploading(false)
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('사진을 삭제하시겠습니까?')) return
    await galleryApi.delete(id)
    if (selectedDate) await loadPhotos(selectedDate)
    await loadDates()
  }

  return (
    <div className="space-y-8 max-w-2xl">
      {/* 헤더 */}
      <div className="flex items-center justify-between pb-4" style={{ borderBottom: '1px solid var(--border-dark)' }}>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-main)' }}>사진 관리</h1>
        <a href="/admin/notice" style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '14px' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--gold-mid)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}>
          공지 관리 →
        </a>
      </div>

      {/* 업로드 폼 */}
      <form onSubmit={handleUpload} className="space-y-4 rounded-lg p-6"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border-gold)' }}>
        <h2 className="text-base font-semibold" style={{ color: 'var(--text-main)' }}>사진 업로드</h2>
        <input type="date" value={takenDate} onChange={(e) => setTakenDate(e.target.value)} required style={inputStyle} />
        <input
          type="text"
          placeholder="사진 설명 (선택)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          style={inputStyle}
        />
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          required
          className="w-full text-sm"
          style={{ color: 'var(--text-sub)' }}
        />
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>* 이미지는 자동으로 WebP 형식으로 변환됩니다.</p>
        <button type="submit" disabled={uploading} style={{ ...primaryBtnStyle, opacity: uploading ? 0.5 : 1 }}>
          {uploading ? '업로드 중...' : '업로드'}
        </button>
        {message && <p className="text-sm" style={{ color: 'var(--gold-mid)' }}>{message}</p>}
      </form>

      {/* 날짜 목록 */}
      <div className="space-y-4">
        <h2 className="text-base font-semibold" style={{ color: 'var(--text-main)' }}>날짜별 사진 보기</h2>
        {dates.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>등록된 사진이 없습니다.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {dates.map((date) => (
              <button
                key={date}
                onClick={() => loadPhotos(date)}
                className="px-4 py-2 rounded text-sm font-medium transition-colors"
                style={
                  selectedDate === date
                    ? { background: 'var(--gold-mid)', color: 'var(--bg-base)', border: '1px solid var(--gold-mid)', cursor: 'pointer', fontFamily: 'inherit' }
                    : { background: 'var(--bg-card)', color: 'var(--text-sub)', border: '1px solid var(--border-gold)', cursor: 'pointer', fontFamily: 'inherit' }
                }
                onMouseEnter={e => {
                  if (selectedDate !== date) (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--gold-mid)'
                }}
                onMouseLeave={e => {
                  if (selectedDate !== date) (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-gold)'
                }}
              >
                {date}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 선택된 날짜 사진 */}
      {selectedDate && (
        <div className="space-y-4">
          <h3 className="font-semibold" style={{ color: 'var(--text-main)' }}>
            {selectedDate} 사진 ({photos.length}장)
          </h3>
          {photos.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>사진이 없습니다.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {photos.map((photo) => (
                <PhotoCard key={photo.id} photo={photo} onDelete={handleDelete} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function convertToWebP(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('canvas context 없음'))
      ctx.drawImage(img, 0, 0)
      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(url)
          if (blob) resolve(blob)
          else reject(new Error('WebP 변환 실패'))
        },
        'image/webp',
        0.85
      )
    }
    img.onerror = reject
    img.src = url
  })
}
