'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { noticeApi } from '@/lib/api'
import NoticeCard from '@/components/NoticeCard'
import type { Notice } from '@/types'

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

function NoticeContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const id = searchParams.get('id')

  const [notices, setNotices] = useState<Notice[]>([])
  const [notice, setNotice] = useState<Notice | null>(null)
  const [loadingList, setLoadingList] = useState(true)
  const [loadingDetail, setLoadingDetail] = useState(false)

  useEffect(() => {
    noticeApi.getAll()
      .then(setNotices)
      .catch(console.error)
      .finally(() => setLoadingList(false))
  }, [])

  useEffect(() => {
    if (!id) return
    setLoadingDetail(true)
    noticeApi.getOne(Number(id))
      .then(setNotice)
      .catch(console.error)
      .finally(() => setLoadingDetail(false))
  }, [id])

  if (id) {
    if (loadingDetail) return <p className="py-8 text-center" style={{ color: 'var(--text-muted)' }}>불러오는 중...</p>
    if (!notice) return <p className="py-8 text-center" style={{ color: 'var(--text-muted)' }}>존재하지 않는 공지입니다.</p>

    const date = new Date(notice.created_at).toLocaleDateString('ko-KR')
    return (
      <div className="max-w-2xl space-y-6">
        <button
          onClick={() => router.push('/notice')}
          className="text-sm transition-colors"
          style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--gold-mid)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
        >
          ← 목록으로
        </button>

        <div className="pb-4" style={{ borderBottom: '1px solid var(--border-dark)' }}>
          <div className="flex items-center gap-2 mb-2">
            {notice.is_pinned === 1 && (
              <span
                className="text-xs font-bold px-2 py-0.5 rounded shrink-0"
                style={{ background: 'var(--gold-mid)', color: 'var(--bg-base)' }}
              >
                고정
              </span>
            )}
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text-main)' }}>
              {notice.title}
            </h1>
          </div>
          <div className="text-sm flex gap-4" style={{ color: 'var(--text-muted)' }}>
            <span>{notice.author}</span>
            <span>{date}</span>
          </div>
        </div>

        <div className="leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--text-sub)' }}>
          {notice.content}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <SectionTitle label="공지사항" />
      {loadingList ? (
        <p className="text-center py-8" style={{ color: 'var(--text-muted)' }}>불러오는 중...</p>
      ) : notices.length === 0 ? (
        <p className="text-center py-8" style={{ color: 'var(--text-muted)' }}>등록된 공지가 없습니다.</p>
      ) : (
        <div className="space-y-3">
          {notices.map((n) => (
            <NoticeCard key={n.id} notice={n} />
          ))}
        </div>
      )}
    </div>
  )
}

export default function NoticePage() {
  return (
    <Suspense fallback={<p className="text-center py-8" style={{ color: 'var(--text-muted)' }}>불러오는 중...</p>}>
      <NoticeContent />
    </Suspense>
  )
}
