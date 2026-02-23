'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { galleryApi } from '@/lib/api'
import { getStoredToken } from '@/lib/firebase'
import PhotoCard from '@/components/PhotoCard'
import type { Photo } from '@/types'

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
      // 브라우저에서 WebP 변환
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
      <div className="flex items-center justify-between border-b border-gray-800 pb-4">
        <h1 className="text-2xl font-bold text-white">사진 관리</h1>
        <a href="/admin/notice" className="text-sm text-gray-400 hover:text-white">공지 관리 →</a>
      </div>

      {/* 업로드 폼 */}
      <form onSubmit={handleUpload} className="space-y-4 bg-gray-800 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-white">사진 업로드</h2>
        <input
          type="date"
          value={takenDate}
          onChange={(e) => setTakenDate(e.target.value)}
          required
          className="w-full bg-gray-900 text-white px-4 py-2 rounded border border-gray-700 focus:border-amber-500 outline-none"
        />
        <input
          type="text"
          placeholder="사진 설명 (선택)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full bg-gray-900 text-white px-4 py-2 rounded border border-gray-700 focus:border-amber-500 outline-none"
        />
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          required
          className="w-full text-gray-400 text-sm"
        />
        <p className="text-xs text-gray-500">* 이미지는 자동으로 WebP 형식으로 변환됩니다.</p>
        <button
          type="submit"
          disabled={uploading}
          className="bg-amber-500 text-black font-bold px-6 py-2 rounded hover:bg-amber-400 disabled:opacity-50"
        >
          {uploading ? '업로드 중...' : '업로드'}
        </button>
        {message && <p className="text-sm text-green-400">{message}</p>}
      </form>

      {/* 날짜 목록 */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-white">날짜별 사진 보기</h2>
        {dates.length === 0 ? (
          <p className="text-gray-500">등록된 사진이 없습니다.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {dates.map((date) => (
              <button
                key={date}
                onClick={() => loadPhotos(date)}
                className={`px-4 py-2 rounded text-sm font-medium border transition-colors ${
                  selectedDate === date
                    ? 'bg-amber-500 text-black border-amber-500'
                    : 'bg-gray-800 text-gray-300 border-gray-700 hover:border-amber-500'
                }`}
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
          <h3 className="text-white font-semibold">{selectedDate} 사진 ({photos.length}장)</h3>
          {photos.length === 0 ? (
            <p className="text-gray-500">사진이 없습니다.</p>
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

// 브라우저 Canvas API를 이용한 WebP 변환
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
