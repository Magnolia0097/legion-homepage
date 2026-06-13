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

interface ClassStat {
  board_name: string
  total: number
  positive: number
  negative: number
  neutral: number
}

export default function ClassBoard() {
  const [stats, setStats] = useState<ClassStat[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!supabase) { setLoading(false); return }

    const since = new Date()
    since.setDate(since.getDate() - 7)

    supabase
      .from('voice_raw_posts')
      .select('board_name, sentiment')
      .not('board_name', 'is', null)
      .not('classified_at', 'is', null)
      .gte('posted_at', since.toISOString())
      .then(({ data }) => {
        if (!data?.length) { setLoading(false); return }

        const map: Record<string, ClassStat> = {}
        for (const row of data) {
          if (!row.board_name || row.board_name === '자유') continue
          if (!map[row.board_name]) {
            map[row.board_name] = { board_name: row.board_name, total: 0, positive: 0, negative: 0, neutral: 0 }
          }
          map[row.board_name].total++
          if (row.sentiment === 'positive') map[row.board_name].positive++
          else if (row.sentiment === 'negative') map[row.board_name].negative++
          else map[row.board_name].neutral++
        }
        setStats(Object.values(map))
        setLoading(false)
      })
  }, [])

  if (loading || stats.length === 0) return null

  return (
    <div>
      <h2 className="text-base font-bold mb-3" style={{ color: 'var(--gold-light)' }}>
        직업별 반응
        <span className="text-xs font-normal ml-2" style={{ color: 'var(--text-muted)' }}>최근 7일</span>
      </h2>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {CLASS_LIST.map(cls => {
          const stat = stats.find(s => s.board_name === cls.name)
          const dominant = stat
            ? (stat.positive > stat.negative ? 'positive' : stat.negative > stat.positive ? 'negative' : 'neutral')
            : null
          const borderColor = dominant === 'positive' ? '#81c784' : dominant === 'negative' ? '#e05050' : 'var(--border-dark)'

          return (
            <div key={cls.name} style={{
              background: 'var(--bg-card)',
              border: `1px solid ${stat ? borderColor + '55' : 'var(--border-dark)'}`,
              borderRadius: '12px',
              padding: '14px',
              opacity: stat ? 1 : 0.45,
            }}>
              <p style={{ fontSize: '13px', fontWeight: 700, color: cls.color, marginBottom: '6px' }}>{cls.name}</p>
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
    </div>
  )
}
