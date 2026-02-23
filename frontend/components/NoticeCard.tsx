import Link from 'next/link'
import type { Notice } from '@/types'

interface Props {
  notice: Notice
}

export default function NoticeCard({ notice }: Props) {
  const date = new Date(notice.created_at).toLocaleDateString('ko-KR')

  return (
    <Link
      href={`/notice?id=${notice.id}`}
      className="block border border-gray-700 rounded-lg p-4 hover:border-amber-500 hover:bg-gray-800 transition-colors"
    >
      <div className="flex items-center gap-2 mb-1">
        {notice.is_pinned === 1 && (
          <span className="text-xs bg-amber-500 text-black font-bold px-2 py-0.5 rounded">
            고정
          </span>
        )}
        <h3 className="text-white font-medium truncate">{notice.title}</h3>
      </div>
      <div className="text-xs text-gray-500 flex gap-3">
        <span>{notice.author}</span>
        <span>{date}</span>
      </div>
    </Link>
  )
}
