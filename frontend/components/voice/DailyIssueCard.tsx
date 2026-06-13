interface DailyIssue {
  summary: string
  count: number
}

interface Props {
  issue: DailyIssue
  rank: number
}

export default function DailyIssueCard({ issue, rank }: Props) {
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border-dark)',
      borderRadius: '12px',
      padding: '16px',
      display: 'flex',
      alignItems: 'flex-start',
      gap: '12px',
    }}>
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
      <div style={{ flex: 1 }}>
        <p style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-main)', lineHeight: 1.4, marginBottom: '6px' }}>
          {issue.summary}
        </p>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          언급 <strong style={{ color: 'var(--text-sub)' }}>{issue.count}회</strong>
        </p>
      </div>
    </div>
  )
}
