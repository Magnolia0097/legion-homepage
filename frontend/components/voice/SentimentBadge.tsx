type Sentiment = 'positive' | 'negative' | 'neutral' | 'spam'

interface Props {
  sentiment: Sentiment
  size?: 'sm' | 'md'
}

const CONFIG: Record<Sentiment, { label: string; bg: string; color: string }> = {
  positive: { label: '긍정', bg: 'rgba(76,175,80,0.15)', color: '#81c784' },
  negative: { label: '부정', bg: 'rgba(224,80,80,0.15)', color: '#e05050' },
  neutral:  { label: '중립', bg: 'rgba(122,96,48,0.2)',  color: '#a08060' },
  spam:     { label: '스팸', bg: 'rgba(100,100,100,0.15)', color: '#888' },
}

export default function SentimentBadge({ sentiment, size = 'sm' }: Props) {
  const { label, bg, color } = CONFIG[sentiment] ?? CONFIG.neutral
  const fontSize = size === 'md' ? '12px' : '10px'
  const padding = size === 'md' ? '3px 10px' : '2px 7px'
  return (
    <span style={{
      display: 'inline-block',
      background: bg,
      color,
      borderRadius: '9999px',
      fontSize,
      fontWeight: 700,
      padding,
      letterSpacing: '0.03em',
    }}>
      {label}
    </span>
  )
}
