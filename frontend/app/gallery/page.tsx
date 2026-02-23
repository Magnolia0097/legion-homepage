'use client'

import { useEffect, useState, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import { galleryApi } from '@/lib/api'
import PhotoCard from '@/components/PhotoCard'
import type { GalleryDate, Photo } from '@/types'

function GalleryContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const date = searchParams.get('date')

  const [dates, setDates] = useState<GalleryDate[]>([])
  const [photos, setPhotos] = useState<Photo[]>([])
  const [loadingDates, setLoadingDates] = useState(true)
  const [loadingPhotos, setLoadingPhotos] = useState(false)

  useEffect(() => {
    galleryApi.getDates()
      .then(setDates)
      .catch(console.error)
      .finally(() => setLoadingDates(false))
  }, [])

  useEffect(() => {
    if (!date) return
    setLoadingPhotos(true)
    galleryApi.getByDate(date)
      .then(setPhotos)
      .catch(console.error)
      .finally(() => setLoadingPhotos(false))
  }, [date])

  if (date) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4 border-b border-gray-800 pb-4">
          <button
            onClick={() => router.push('/gallery')}
            className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
          >
            ← 목록으로
          </button>
          <h1 className="text-2xl font-bold text-white">{date} 사진</h1>
        </div>
        {loadingPhotos ? (
          <p className="text-gray-500">불러오는 중...</p>
        ) : photos.length === 0 ? (
          <p className="text-gray-500">사진이 없습니다.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {photos.map((photo) => (
              <PhotoCard key={photo.id} photo={photo} />
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white border-b border-gray-800 pb-4">사진첩</h1>
      {loadingDates ? (
        <p className="text-gray-500">불러오는 중...</p>
      ) : dates.length === 0 ? (
        <p className="text-gray-500">등록된 사진이 없습니다.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {dates.map(({ taken_date }) => (
            <Link
              key={taken_date}
              href={`/gallery?date=${taken_date}`}
              className="bg-gray-800 rounded-lg p-6 text-center hover:bg-gray-700 hover:border-amber-500 border border-gray-700 transition-colors"
            >
              <p className="text-amber-400 font-semibold text-lg">📅</p>
              <p className="text-white font-medium mt-1">{taken_date}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

export default function GalleryPage() {
  return (
    <Suspense fallback={<p className="text-gray-500">불러오는 중...</p>}>
      <GalleryContent />
    </Suspense>
  )
}
