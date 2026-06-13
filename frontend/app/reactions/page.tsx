'use client'

import { useEffect, useState } from 'react'
import NowStats from '@/components/voice/NowStats'
import TrendChart from '@/components/voice/TrendChart'
import DailyIssueCard from '@/components/voice/DailyIssueCard'
import ClassBoard from '@/components/voice/ClassBoard'
import type { NowData } from '@/app/api/voice/_mock/now'
import type { DailyData } from '@/app/api/voice/_mock/trend'
import { getMockNow } from '@/app/api/voice/_mock/now'
import { getMockTrend } from '@/app/api/voice/_mock/trend'
import { supabase } from '@/lib/supabase'

interface DailyIssue {
  summary: string
  count: number
}

export default function ReactionsPage() {
  const [nowData, setNowData] = useState<NowData | null>(null)
  const [trendData, setTrendData] = useState<DailyData[]>([])
  const [dailyIssues, setDailyIssues] = useState<DailyIssue[]>([])
  const [isLive, setIsLive] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!supabase) {
      setNowData(getMockNow())
      setTrendData(getMockTrend(7))
      setLoading(false)
      return
    }

    Promise.all([
      supabase
        .from('voice_hourly_stats')
        .select('*')
        .order('hour', { ascending: false })
        .limit(1)
        .single(),
      supabase
        .from('voice_daily_stats')
        .select('*')
        .order('day', { ascending: false })
        .limit(7),
    ])
      .then(([{ data: nowRow, error: e1 }, { data: trendRows, error: e2 }]) => {
        if (!e1 && nowRow) {
          setNowData(nowRow as NowData)
          setIsLive(true)
          // 오늘(가장 최근) 일별 통계에서 top_issues 추출
          const todayRow = trendRows?.[0]
          const issues = (todayRow?.top_issues ?? []) as DailyIssue[]
          setDailyIssues(issues.slice(0, 5))
        } else {
          setNowData(getMockNow())
        }

        if (!e2 && trendRows?.length) {
          setTrendData([...trendRows].reverse() as DailyData[])
        } else {
          setTrendData(getMockTrend(7))
        }

        setLoading(false)
      })
      .catch(() => {
        setNowData(getMockNow())
        setTrendData(getMockTrend(7))
        setLoading(false)
      })
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p style={{ color: 'var(--text-muted)' }}>불러오는 중...</p>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 pb-24 space-y-8">
      {/* 헤더 */}
      <div>
        <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--gold-light)' }}>반응</h1>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          인벤 아이온2 게시판 여론 모니터링
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {isLive ? (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs"
              style={{ background: 'rgba(129,199,132,0.1)', border: '1px solid rgba(129,199,132,0.3)', color: '#81c784' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#81c784', display: 'inline-block' }} />
              실시간 데이터
            </div>
          ) : (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs"
              style={{ background: 'rgba(224,80,80,0.1)', border: '1px solid rgba(224,80,80,0.2)', color: '#e07070' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#e05050', display: 'inline-block' }} />
              Mock 데이터
            </div>
          )}
        </div>
      </div>

      {/* 섹션 1: 지금 상황 (자유게시판 기준) */}
      {nowData && <NowStats data={nowData} />}

      {/* 섹션 2: 추이 */}
      {trendData.length > 0 && <TrendChart data={trendData} />}

      {/* 섹션 3: 직업별 반응 */}
      <ClassBoard />

      {/* 섹션 4: 오늘의 주요 이슈 TOP 5 */}
      <div>
        <h2 className="text-base font-bold mb-1" style={{ color: 'var(--gold-light)' }}>
          오늘의 주요 이슈 TOP 5
        </h2>
        <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
          오늘 하루 기준 가장 많이 언급된 이슈
        </p>
        {dailyIssues.length > 0 ? (
          <div className="space-y-3">
            {dailyIssues.map((issue, i) => (
              <DailyIssueCard key={i} issue={issue} rank={i + 1} />
            ))}
          </div>
        ) : (
          <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-dark)',
            borderRadius: '12px',
            padding: '24px',
            textAlign: 'center',
          }}>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              오늘 집계 데이터가 아직 없습니다.<br />
              파이프라인 실행 후 표시됩니다.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
