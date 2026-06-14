'use client'

import { useState } from 'react'
import type { DailyIssue, VoicePost } from '@/types'

interface Props {
  issue: DailyIssue
  rank: number
  posts?: VoicePost[]
}

const SENTIMENT_COLOR: Record<string, string> = {
  positive: '#81c784',
  negative: '#e05050',
  neutral: 'var(--text-muted)',
}

const SENTIMENT_LABEL: Record<string, string> = {
  positive: '긍정',
  negative: '부정',
  neutral: '중립',
}

export default function DailyIssueCard({ issue, rank, posts = [] }: Props) {
  const [expanded, setExpanded] = useState(false)
  const relatedPosts = posts.filter(p => p.issue_summary === issue.summary)

  return (
    <div className="voice-card" style={{ padding: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
        <span style={{
          flexShrink: 0,
          width: '24px', height: '24px',
          borderRadius: '50%',
          background: rank <= 3 ? 'rgba(212,160,23,0.15)' : 'var(--bg-base)',
          color: rank <= 3 ? 'var(--gold-mid)' : 'var(--text-muted)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '11px', fontWeight: 700,
        }}>
          {rank}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-main)', lineHeight: 1.4, marginBottom: '6px' }}>
            {issue.summary}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              언급 <strong style={{ color: 'var(--text-sub)' }}>{issue.count}회</strong>
            </p>
            {relatedPosts.length > 0 && (
              <button
                onClick={() => setExpanded(!expanded)}
                style={{
                  fontSize: '11px',
                  color: 'var(--gold-mid)',
                  background: 'rgba(212,160,23,0.08)',
                  border: '1px solid rgba(212,160,23,0.2)',
                  borderRadius: '6px',
                  padding: '2px 8px',
                  cursor: 'pointer',
                }}
              >
                원문 {relatedPosts.length}건 {expanded ? '▲' : '▼'}
              </button>
            )}
          </div>
        </div>
      </div>

      {expanded && relatedPosts.length > 0 && (
        <div style={{
          marginTop: '12px',
          paddingTop: '12px',
          borderTop: '1px solid var(--border-dark)',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
        }}>
          {relatedPosts.map(post => (
            <a
              key={post.id}
              href={post.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 10px',
                borderRadius: '8px',
                background: 'var(--bg-base)',
                border: '1px solid var(--border-dark)',
                textDecoration: 'none',
              }}
            >
              <span style={{
                flexShrink: 0,
                fontSize: '10px',
                fontWeight: 700,
                padding: '2px 6px',
                borderRadius: '4px',
                background: SENTIMENT_COLOR[post.sentiment] + '22',
                color: SENTIMENT_COLOR[post.sentiment],
              }}>
                {SENTIMENT_LABEL[post.sentiment] ?? '중립'}
              </span>
              <span style={{
                fontSize: '13px',
                color: 'var(--text-main)',
                flex: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {post.title}
              </span>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', flexShrink: 0 }}>↗</span>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
