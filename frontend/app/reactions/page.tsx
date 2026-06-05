'use client'

import { useEffect, useState } from 'react'
import NowStats from '@/components/voice/NowStats'
import TrendChart from '@/components/voice/TrendChart'
import IssueCard from '@/components/voice/IssueCard'
import type { NowData } from '@/app/api/voice/_mock/now'
import type { DailyData } from '@/app/api/voice/_mock/trend'
import type { Issue } from '@/app/api/voice/_mock/issues'

// 정적 빌드(output: export)에서 API Route가 동작하지 않으므로
// Mock 데이터를 직접 import해서 사용. 나중에 Supabase 직접 연결로 교체.
import { getMockNow } from '@/app/api/voice/_mock/now'
import { getMockTrend } from '@/app/api/voice/_mock/trend'
import { getMockIssues } from '@/app/api/voice/_mock/issues'

export default function ReactionsPage() {
  const [nowData, setNowData] = useState<NowData | null>(null)
  const [trendData, setTrendData] = useState<DailyData[]>([])
  const [issuesData, setIssuesData] = useState<Issue[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setNowData(getMockNow())
    setTrendData(getMockTrend(7))
    setIssuesData(getMockIssues(5))
    setLoading(false)
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
      {/* 페이지 헤더 */}
      <div>
        <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--gold-light)' }}>반응</h1>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          인벤 아이온2 게시판 여론 모니터링
        </p>
        <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs"
          style={{ background: 'rgba(224,80,80,0.1)', border: '1px solid rgba(224,80,80,0.2)', color: '#e07070' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#e05050', display: 'inline-block' }} />
          Mock 데이터 (실 데이터 연결 준비 중)
        </div>
      </div>

      {/* 섹션 1: 지금 상황 */}
      {nowData && <NowStats data={nowData} />}

      {/* 섹션 2: 추이 */}
      {trendData.length > 0 && <TrendChart data={trendData} />}

      {/* 섹션 3: 주요 이슈 */}
      <div>
        <h2 className="text-base font-bold mb-3" style={{ color: 'var(--gold-light)' }}>
          주요 이슈 TOP 5
        </h2>
        <div className="space-y-3">
          {issuesData.map((issue, i) => (
            <IssueCard key={i} issue={issue} rank={i + 1} />
          ))}
        </div>
      </div>
    </div>
  )
}
