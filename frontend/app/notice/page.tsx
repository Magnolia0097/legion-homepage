'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { noticeApi } from '@/lib/api'
import NoticeCard from '@/components/NoticeCard'
import type { Notice } from '@/types'

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
    if (loadingDetail) return <p className="text-gray-500">불러오는 중...</p>
    if (!notice) return <p className="text-gray-500">존재하지 않는 공지입니다.</p>

    const date = new Date(notice.created_at).toLocaleDateString('ko-KR')
    return (
      <div className="max-w-2xl space-y-6">
        <button
          onClick={() => router.push('/notice')}
          className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
        >
          ← 목록으로
        </button>
        <div className="border-b border-gray-800 pb-4">
          <div className="flex items-center gap-2 mb-2">
            {notice.is_pinned === 1 && (
              <span className="text-xs bg-amber-500 text-black font-bold px-2 py-0.5 rounded">
                고정
              </span>
            )}
            <h1 className="text-2xl font-bold text-white">{notice.title}</h1>
          </div>
          <div className="text-sm text-gray-500 flex gap-4">
            <span>{notice.author}</span>
            <span>{date}</span>
          </div>
        </div>
        <div className="text-gray-300 leading-relaxed whitespace-pre-wrap">
          {notice.content}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white border-b border-gray-800 pb-4">공지사항</h1>
      {loadingList ? (
        <p className="text-gray-500">불러오는 중...</p>
      ) : notices.length === 0 ? (
        <p className="text-gray-500">등록된 공지가 없습니다.</p>
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
    <Suspense fallback={<p className="text-gray-500">불러오는 중...</p>}>
      <NoticeContent />
    </Suspense>
  )
}
