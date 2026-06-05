'use client'

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import type { NowData } from '@/app/api/voice/_mock/now'

const SENTIMENT_COLORS = {
  긍정: '#81c784',
  부정: '#e05050',
  중립: '#7a6030',
}

interface Props {
  data: NowData
}

export default function NowStats({ data }: Props) {
  const pieData = [
    { name: '긍정', value: data.positive_count },
    { name: '부정', value: data.negative_count },
    { name: '중립', value: data.neutral_count },
  ].filter(d => d.value > 0)

  const topKeywords = data.top_keywords.slice(0, 3)

  return (
    <div>
      <h2 className="text-base font-bold mb-3" style={{ color: 'var(--gold-light)' }}>
        지금 상황
        <span className="text-xs font-normal ml-2" style={{ color: 'var(--text-muted)' }}>최근 1시간</span>
      </h2>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {/* 카드 1: 총 글 수 */}
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-dark)',
          borderRadius: '12px',
          padding: '16px',
        }}>
          <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>총 글 수</p>
          <p className="text-3xl font-bold" style={{ color: 'var(--gold-light)' }}>{data.total_count}</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>건</p>
        </div>

        {/* 카드 2: 감성 분포 도넛 차트 */}
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-dark)',
          borderRadius: '12px',
          padding: '16px',
        }}>
          <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>감성 분포</p>
          <div style={{ height: '100px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={28}
                  outerRadius={42}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {pieData.map((entry) => (
                    <Cell
                      key={entry.name}
                      fill={SENTIMENT_COLORS[entry.name as keyof typeof SENTIMENT_COLORS]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-dark)',
                    borderRadius: '8px',
                    fontSize: '12px',
                    color: 'var(--text-main)',
                  }}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={(value: any, name: any) => [`${value}건`, name]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center gap-3 mt-1">
            {pieData.map(d => (
              <span key={d.name} className="flex items-center gap-1" style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', display: 'inline-block', background: SENTIMENT_COLORS[d.name as keyof typeof SENTIMENT_COLORS] }} />
                {d.name} {d.value}
              </span>
            ))}
          </div>
        </div>

        {/* 카드 3: 주요 키워드 TOP 3 */}
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-dark)',
          borderRadius: '12px',
          padding: '16px',
        }}>
          <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>주요 키워드 TOP 3</p>
          <div className="space-y-2">
            {topKeywords.map((kw, i) => (
              <div key={kw.keyword} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span style={{
                    width: '18px', height: '18px', borderRadius: '50%',
                    background: i === 0 ? 'rgba(212,160,23,0.2)' : 'var(--bg-base)',
                    color: i === 0 ? 'var(--gold-mid)' : 'var(--text-muted)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '10px', fontWeight: 700, flexShrink: 0,
                  }}>
                    {i + 1}
                  </span>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main)' }}>{kw.keyword}</span>
                </div>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{kw.count}회</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
