'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const CLASS_LIST = [
  { name: '검성',   color: '#e05050' },
  { name: '수호성', color: '#7ec8e3' },
  { name: '살성',   color: '#c084fc' },
  { name: '궁성',   color: '#86efac' },
  { name: '호법성', color: '#fbbf24' },
  { name: '치유성', color: '#34d399' },
  { name: '마도성', color: '#818cf8' },
  { name: '정령성', color: '#f97316' },
]

const SENTIMENT_COLOR: Record<string, string> = {
  positive: '#81c784',
  negative: '#e05050',
  neutral: 'var(--text-muted)',
}

const SENTIMENT_LABEL: Record<string, string> = {
  positive: '긍',
  negative: '부',
  neutral: '중',
}

interface PostItem {
  id: number
  title: string
  url: string
  sentiment: string
}

interface ClassStat {
  board_name: string
  total: number
  positive: number
  negative: number
  neutral: number
  posts: PostItem[]
}

export default function ClassBoard() {
  const [stats, setStats] = useState<ClassStat[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<string | null>(null)

  useEffect(() => {
    if (!supabase) { setLoading(false); return }

    const since = new Date()
    since.setDate(since.getDate() - 7)

    supabase
      .from('voice_raw_posts')
      .select('id, board_name, sentiment, title, url')
      .not('board_name', 'is', null)
      .not('classified_at', 'is', null)
      .gte('posted_at', since.toISOString())
      .order('posted_at', { ascending: false })
      .limit(500)
      .then(({ data }) => {
        if (!data?.length) { setLoading(false); return }

        const map: Record<string, ClassStat> = {}
        for (const row of data) {
          if (!row.board_name || row.board_name === '자유') continue
          if (!map[row.board_name]) {
            map[row.board_name] = {
              board_name: row.board_name,
              total: 0, positive: 0, negative: 0, neutral: 0,
              posts: [],
            }
          }
          map[row.board_name].total++
          if (row.sentiment === 'positive') map[row.board_name].positive++
          else if (row.sentiment === 'negative') map[row.board_name].negative++
          else map[row.board_name].neutral++
          map[row.board_name].posts.push({
            id: row.id,
            title: row.title || '(제목 없음)',
            url: row.url || '#',
            sentiment: row.sentiment || 'neutral',
          })
        }
        setStats(Object.values(map))
        setLoading(false)
      })
  }, [])

  if (loading || stats.length === 0) return null

  const selectedStat = stats.find(s => s.board_name === selected)
  const selectedColor = CLASS_LIST.find(c => c.name === selected)?.color

  return (
    <div>
      <h2 className="text-base font-bold mb-3" style={{ color: 'var(--gold-light)' }}>
        직업별 반응
        <span className="text-xs font-normal ml-2" style={{ color: 'var(--text-muted)' }}>
          최근 7일 · 클릭하면 원문 목록
        </span>
      </h2>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {CLASS_LIST.map(cls => {
          const stat = stats.find(s => s.board_name === cls.name)
          const isSelected = selected === cls.name
          const dominant = stat
            ? (stat.positive > stat.negative ? 'positive' : stat.negative > stat.positive ? 'negative' : 'neutral')
            : null
          const baseBorder = dominant === 'positive' ? '#81c784' : dominant === 'negative' ? '#e05050' : 'var(--border-dark)'

          return (
            <div
              key={cls.name}
              onClick={() => stat && setSelected(isSelected ? null : cls.name)}
              style={{
                background: 'var(--bg-card)',
                border: `1px solid ${stat ? (isSelected ? cls.color : baseBorder + '55') : 'var(--border-dark)'}`,
                borderRadius: '12px',
                padding: '14px',
                opacity: stat ? 1 : 0.45,
                cursor: stat ? 'pointer' : 'default',
                boxShadow: isSelected ? `0 0 0 2px ${cls.color}33` : 'none',
                transition: 'border-color 0.15s, box-shadow 0.15s',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <p style={{ fontSize: '13px', fontWeight: 700, color: cls.color }}>{cls.name}</p>
                {stat && (
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{isSelected ? '▲' : '▼'}</span>
                )}
              </div>
              {stat ? (
                <>
                  <p style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-main)', lineHeight: 1 }}>
                    {stat.total}
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 400, marginLeft: '2px' }}>건</span>
                  </p>
                  <div style={{ height: '4px', borderRadius: '2px', background: 'var(--bg-base)', overflow: 'hidden', margin: '8px 0 6px' }}>
                    {stat.total > 0 && (
                      <>
                        <div style={{ height: '100%', width: `${Math.round(stat.positive / stat.total * 100)}%`, background: '#81c784', float: 'left' }} />
                        <div style={{ height: '100%', width: `${Math.round(stat.negative / stat.total * 100)}%`, background: '#e05050', float: 'left' }} />
                      </>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '6px', fontSize: '10px' }}>
                    <span style={{ color: '#81c784' }}>긍 {stat.positive}</span>
                    <span style={{ color: '#e05050' }}>부 {stat.negative}</span>
                    <span style={{ color: 'var(--text-muted)' }}>중 {stat.neutral}</span>
                  </div>
                </>
              ) : (
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>데이터 없음</p>
              )}
            </div>
          )
        })}
      </div>

      {selectedStat && (
        <div style={{
          marginTop: '10px',
          background: 'var(--bg-card)',
          border: `1px solid ${selectedColor}44`,
          borderRadius: '12px',
          padding: '16px',
        }}>
          <p style={{ fontSize: '13px', fontWeight: 700, color: selectedColor, marginBottom: '10px' }}>
            {selected} 게시글 ({selectedStat.posts.length}건)
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '320px', overflowY: 'auto' }}>
            {selectedStat.posts.map(post => (
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
                  padding: '2px 5px',
                  borderRadius: '4px',
                  background: SENTIMENT_COLOR[post.sentiment] + '22',
                  color: SENTIMENT_COLOR[post.sentiment],
                }}>
                  {SENTIMENT_LABEL[post.sentiment] ?? '중'}
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
        </div>
      )}
    </div>
  )
}
