'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { galleryApi } from '@/lib/api'
import PhotoCard from '@/components/PhotoCard'
import type { GalleryDate, Photo } from '@/types'

function SectionTitle({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 mb-6">
      <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, transparent, var(--border-gold))' }} />
      <span className="text-xs font-bold tracking-widest uppercase" style={{ color: 'var(--gold-mid)' }}>
        {label}
      </span>
      <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, var(--border-gold), transparent)' }} />
    </div>
  )
}

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
        <div className="flex items-center gap-4 pb-4" style={{ borderBottom: '1px solid var(--border-dark)' }}>
          <button
            onClick={() => router.push('/gallery')}
            className="text-sm transition-colors"
            style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--gold-mid)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
          >
            ← 목록으로
          </button>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-main)' }}>{date} 사진</h1>
        </div>
        {loadingPhotos ? (
          <p className="text-center py-8" style={{ color: 'var(--text-muted)' }}>불러오는 중...</p>
        ) : photos.length === 0 ? (
          <p className="text-center py-8" style={{ color: 'var(--text-muted)' }}>사진이 없습니다.</p>
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
    <div className="space-y-4">
      <SectionTitle label="사진첩" />
      {loadingDates ? (
        <p className="text-center py-8" style={{ color: 'var(--text-muted)' }}>불러오는 중...</p>
      ) : dates.length === 0 ? (
        <p className="text-center py-8" style={{ color: 'var(--text-muted)' }}>등록된 사진이 없습니다.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {dates.map(({ taken_date }) => (
            <a
              key={taken_date}
              href={`/gallery?date=${taken_date}`}
              className="rounded-lg p-6 text-center transition-colors"
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border-gold)',
                textDecoration: 'none',
                display: 'block',
              }}
              onMouseEnter={e => {
                const el = e.currentTarget as HTMLAnchorElement
                el.style.background = 'rgba(212,160,23,0.07)'
                el.style.borderColor = 'var(--gold-mid)'
              }}
              onMouseLeave={e => {
                const el = e.currentTarget as HTMLAnchorElement
                el.style.background = 'var(--bg-card)'
                el.style.borderColor = 'var(--border-gold)'
              }}
            >
              <p className="font-semibold text-lg" style={{ color: 'var(--gold-mid)' }}>📅</p>
              <p className="font-medium mt-1" style={{ color: 'var(--text-main)' }}>{taken_date}</p>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

export default function GalleryPage() {
  return (
    <Suspense fallback={<p className="text-center py-8" style={{ color: 'var(--text-muted)' }}>불러오는 중...</p>}>
      <GalleryContent />
    </Suspense>
  )
}
