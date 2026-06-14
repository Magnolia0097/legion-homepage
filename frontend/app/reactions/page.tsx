'use client'

import { useEffect, useState } from 'react'
import NowStats from '@/components/voice/NowStats'
import TrendChart from '@/components/voice/TrendChart'
import DailyIssueCard from '@/components/voice/DailyIssueCard'
import ClassBoard from '@/components/voice/ClassBoard'
import type { NowData, DailyData, DailyIssue, VoicePost, Keyword } from '@/types'
import { supabase } from '@/lib/supabase'

const KST_OFFSET_MS = 9 * 60 * 60 * 1000
const REFRESH_INTERVAL_MS = 60_000  // "실시간" 배지에 맞춰 1분마다 갱신

// 현재 시각 기준 KST '오늘'의 시작 ISO(UTC) + 날짜 문자열(YYYY-MM-DD).
function getKstToday(): { startISO: string; dateStr: string } {
  const kstNow = new Date(Date.now() + KST_OFFSET_MS)
  const y = kstNow.getUTCFullYear()
  const m = kstNow.getUTCMonth()
  const d = kstNow.getUTCDate()
  const startISO = new Date(Date.UTC(y, m, d) - KST_OFFSET_MS).toISOString()
  const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  return { startISO, dateStr }
}

export default function ReactionsPage() {
  const [nowData, setNowData] = useState<NowData | null>(null)
  const [trendData, setTrendData] = useState<DailyData[]>([])
  const [dailyIssues, setDailyIssues] = useState<DailyIssue[]>([])
  const [todayPosts, setTodayPosts] = useState<VoicePost[]>([])
  const [hasData, setHasData] = useState(false)
  const [loading, setLoading] = useState(true)

  // supabase가 null이면 환경변수 미설정(빌드/배포 설정 문제) — '데이터 없음'과 구분.
  const configMissing = !supabase

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }
    const client = supabase
    let cancelled = false

    const load = async () => {
      const { startISO, dateStr } = getKstToday()
      try {
        const [{ data: nowRow }, { data: trendRows }, { data: rawPosts }] = await Promise.all([
          client
            .from('voice_hourly_stats')
            .select('*')
            .order('hour', { ascending: false })
            .limit(1)
            .maybeSingle(),
          client
            .from('voice_daily_stats')
            .select('*')
            .order('day', { ascending: false })
            .limit(7),
          client
            .from('voice_raw_posts')
            .select('id, title, url, sentiment, issue_summary')
            .not('classified_at', 'is', null)
            .gte('posted_at', startISO)
            .order('posted_at', { ascending: false })
            .limit(200),
        ])

        if (cancelled) return

        if (nowRow) {
          // DB 컬럼은 nullable → UI용으로 정규화(널 안전).
          setNowData({
            hour: nowRow.hour,
            total_count: nowRow.total_count ?? 0,
            positive_count: nowRow.positive_count ?? 0,
            negative_count: nowRow.negative_count ?? 0,
            neutral_count: nowRow.neutral_count ?? 0,
            categories: (nowRow.categories ?? {}) as Record<string, number>,
            top_keywords: (nowRow.top_keywords ?? []) as Keyword[],
            updated_at: nowRow.updated_at ?? nowRow.hour,
          })
        }

        if (trendRows?.length) {
          // nullable DB 컬럼 → UI용 정규화.
          const normalized: DailyData[] = trendRows.map(r => ({
            day: r.day,
            total_count: r.total_count ?? 0,
            positive_count: r.positive_count ?? 0,
            negative_count: r.negative_count ?? 0,
            neutral_count: r.neutral_count ?? 0,
            categories: (r.categories ?? {}) as Record<string, number>,
            top_keywords: (r.top_keywords ?? []) as Keyword[],
            top_issues: (r.top_issues ?? []) as DailyIssue[],
            updated_at: r.updated_at ?? r.day,
          }))
          // '오늘의 이슈'는 KST 오늘 날짜의 집계 행에서만 — 어제 데이터 오표기 방지.
          const todayRow = normalized.find(d => d.day === dateStr)
          setDailyIssues((todayRow?.top_issues ?? []).slice(0, 5))
          setTrendData(normalized.reverse())  // day desc → asc (차트용)
        }

        setTodayPosts((rawPosts ?? []) as VoicePost[])
        // 갱신 시 일시적 빈 응답으로 빈 화면이 깜빡이지 않도록 true는 유지.
        setHasData(prev => prev || !!nowRow || !!trendRows?.length)
        setLoading(false)
      } catch {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    const timer = setInterval(load, REFRESH_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p style={{ color: 'var(--text-muted)' }}>불러오는 중...</p>
      </div>
    )
  }

  if (configMissing || !hasData) {
    return (
      <div>
        <div className="mb-8">
          <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--gold-light)' }}>반응</h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>인벤 아이온2 게시판 여론 모니터링</p>
        </div>
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-dark)',
          borderRadius: '16px',
          padding: '48px 24px',
          textAlign: 'center',
        }}>
          <p style={{ fontSize: '32px', marginBottom: '16px' }}>{configMissing ? '⚙️' : '📭'}</p>
          <p style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '8px' }}>
            {configMissing ? '데이터 연결이 설정되지 않았습니다' : '수집된 데이터가 없습니다'}
          </p>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
            {configMissing ? (
              <>Supabase 환경변수(NEXT_PUBLIC_SUPABASE_URL · ANON_KEY)가 설정되지 않았습니다.<br />배포 환경변수를 확인해 주세요.</>
            ) : (
              <>데이터베이스가 초기화 되었거나 아직 수집이 시작되지 않았습니다.<br />파이프라인 실행 후 자동으로 표시됩니다.</>
            )}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--gold-light)' }}>반응</h1>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          인벤 아이온2 게시판 여론 모니터링
        </p>
        <div className="mt-2">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs"
            style={{ background: 'rgba(129,199,132,0.1)', border: '1px solid rgba(129,199,132,0.3)', color: '#81c784' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#81c784', display: 'inline-block' }} />
            실시간 데이터
          </div>
        </div>
      </div>

      {nowData && <NowStats data={nowData} />}
      {trendData.length > 0 && <TrendChart data={trendData} />}
      <ClassBoard />

      <div>
        <h2 className="text-base font-bold mb-1" style={{ color: 'var(--gold-light)' }}>
          오늘의 주요 이슈 TOP 5
        </h2>
        <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
          오늘 하루 기준 가장 많이 언급된 이슈 · 원문 버튼으로 출처 글 확인
        </p>
        {dailyIssues.length > 0 ? (
          <div className="space-y-3">
            {dailyIssues.map((issue, i) => (
              <DailyIssueCard key={i} issue={issue} rank={i + 1} posts={todayPosts} />
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
