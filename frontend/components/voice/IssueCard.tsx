import SentimentBadge from './SentimentBadge'
import type { Issue } from '@/app/api/voice/_mock/issues'

interface Props {
  issue: Issue
  rank: number
}

export default function IssueCard({ issue, rank }: Props) {
  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-dark)',
        borderRadius: '12px',
        padding: '16px',
      }}
    >
      {/* 상단: 순위 + 요약 + 배지 */}
      <div className="flex items-start gap-3 mb-3">
        <span style={{
          flexShrink: 0,
          width: '24px',
          height: '24px',
          borderRadius: '50%',
          background: rank <= 3 ? 'rgba(212,160,23,0.15)' : 'var(--bg-base)',
          color: rank <= 3 ? 'var(--gold-mid)' : 'var(--text-muted)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '11px',
          fontWeight: 700,
        }}>
          {rank}
        </span>
        <p style={{ flex: 1, fontSize: '15px', fontWeight: 600, color: 'var(--text-main)', lineHeight: 1.4 }}>
          {issue.issue_summary}
        </p>
      </div>

      {/* 중간: 언급수 + 배지 */}
      <div className="flex items-center gap-2 mb-3">
        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          언급 <strong style={{ color: 'var(--text-sub)' }}>{issue.mention_count}회</strong>
        </span>
        <SentimentBadge sentiment={issue.sentiment} />
      </div>

      {/* 키워드 태그 */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {issue.keywords.map((kw) => (
          <span key={kw} style={{
            background: 'rgba(245,200,66,0.08)',
            border: '1px solid rgba(245,200,66,0.2)',
            color: 'var(--gold-mid)',
            borderRadius: '6px',
            fontSize: '11px',
            padding: '2px 8px',
          }}>
            {kw}
          </span>
        ))}
      </div>

      {/* 관련 글 링크 */}
      <div className="flex flex-wrap gap-2">
        {issue.recent_posts.slice(0, 3).map((post, i) => (
          <a
            key={post.url}
            href={post.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: '11px',
              color: 'var(--text-muted)',
              textDecoration: 'none',
              padding: '3px 10px',
              borderRadius: '6px',
              border: '1px solid var(--border-dark)',
              background: 'var(--bg-base)',
            }}
          >
            관련 글 {i + 1} →
          </a>
        ))}
      </div>
    </div>
  )
}
