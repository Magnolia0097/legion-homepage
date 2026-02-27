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
      style={{
        display: 'block',
        background: 'var(--bg-card)',
        border: '1px solid var(--border-gold)',
        borderRadius: '8px',
        padding: '14px 16px',
        textDecoration: 'none',
        transition: 'background 0.2s, border-color 0.2s',
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
      <div className="flex items-center gap-2 mb-1">
        {notice.is_pinned === 1 && (
          <span
            className="text-xs font-bold px-2 py-0.5 rounded shrink-0"
            style={{ background: 'var(--gold-mid)', color: 'var(--bg-base)' }}
          >
            고정
          </span>
        )}
        <h3 className="font-medium truncate" style={{ color: 'var(--text-main)' }}>
          {notice.title}
        </h3>
      </div>
      <div className="text-xs flex gap-3" style={{ color: 'var(--text-muted)' }}>
        <span>{notice.author}</span>
        <span>{date}</span>
      </div>
    </Link>
  )
}
