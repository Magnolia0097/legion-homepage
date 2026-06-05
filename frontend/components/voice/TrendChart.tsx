'use client'

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import type { DailyData } from '@/app/api/voice/_mock/trend'

interface Props {
  data: DailyData[]
}

function formatDay(iso: string) {
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

export default function TrendChart({ data }: Props) {
  const chartData = data.map(d => ({
    day: formatDay(d.day),
    긍정: d.positive_count,
    부정: d.negative_count,
    중립: d.neutral_count,
    total: d.total_count,
  }))

  return (
    <div>
      <h2 className="text-base font-bold mb-3" style={{ color: 'var(--gold-light)' }}>
        추이
        <span className="text-xs font-normal ml-2" style={{ color: 'var(--text-muted)' }}>최근 7일</span>
      </h2>

      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-dark)',
        borderRadius: '12px',
        padding: '16px',
      }}>
        <div style={{ height: '200px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(122,96,48,0.2)" />
              <XAxis
                dataKey="day"
                tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
                axisLine={{ stroke: 'var(--border-dark)' }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
                axisLine={false}
                tickLine={false}
              />
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
              <Legend
                wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}
                formatter={(value) => (
                  <span style={{ color: 'var(--text-muted)' }}>{value}</span>
                )}
              />
              <Line type="monotone" dataKey="긍정" stroke="#81c784" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
              <Line type="monotone" dataKey="부정" stroke="#e05050" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
              <Line type="monotone" dataKey="중립" stroke="#7a6030" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} strokeDasharray="4 2" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
