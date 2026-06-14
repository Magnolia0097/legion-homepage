// TODO(다음주말): Supabase 클라이언트로 교체.
// 교체 가이드: frontend/app/api/voice/README.md 참조
// 타입 단일 출처: frontend/types/index.ts (이 파일은 dev 전용 mock 데이터만 담당)

import type { DailyData } from '@/types'

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().split('T')[0]
}

export function getMockTrend(days: number = 7): DailyData[] {
  const raw: DailyData[] = [
    {
      day: daysAgo(6),
      total_count: 18,
      positive_count: 6,
      negative_count: 8,
      neutral_count: 4,
      categories: { 클래스밸런스: 5, 컨텐츠: 4, 운영소통: 3, 과금BM: 4, PvP: 2 },
      top_keywords: [{ keyword: '클래스', count: 4 }, { keyword: '퀘스트', count: 3 }],
      updated_at: daysAgo(6) + 'T23:00:00Z',
    },
    {
      day: daysAgo(5),
      total_count: 15,
      positive_count: 4,
      negative_count: 9,
      neutral_count: 2,
      categories: { 클래스밸런스: 6, 과금BM: 4, 서버기술: 3, 운영소통: 2 },
      top_keywords: [{ keyword: '밸런스', count: 5 }, { keyword: '과금', count: 3 }],
      updated_at: daysAgo(5) + 'T23:00:00Z',
    },
    {
      // 패치 적용일 — 부정 급증
      day: daysAgo(4),
      total_count: 47,
      positive_count: 5,
      negative_count: 34,
      neutral_count: 8,
      categories: { 클래스밸런스: 21, 과금BM: 10, 서버기술: 8, 운영소통: 5, PvP: 3 },
      top_keywords: [
        { keyword: '글라디', count: 14 },
        { keyword: '버프', count: 11 },
        { keyword: '너프', count: 9 },
      ],
      updated_at: daysAgo(4) + 'T23:00:00Z',
    },
    {
      day: daysAgo(3),
      total_count: 38,
      positive_count: 6,
      negative_count: 26,
      neutral_count: 6,
      categories: { 클래스밸런스: 16, 과금BM: 8, 서버기술: 7, 운영소통: 5, PvP: 2 },
      top_keywords: [
        { keyword: '글라디', count: 10 },
        { keyword: '버프', count: 8 },
        { keyword: '전장', count: 6 },
      ],
      updated_at: daysAgo(3) + 'T23:00:00Z',
    },
    {
      day: daysAgo(2),
      total_count: 22,
      positive_count: 7,
      negative_count: 11,
      neutral_count: 4,
      categories: { 클래스밸런스: 9, 컨텐츠: 5, 과금BM: 4, 운영소통: 3, PvP: 1 },
      top_keywords: [
        { keyword: '글라디', count: 7 },
        { keyword: '버프', count: 5 },
        { keyword: '클래스', count: 4 },
      ],
      updated_at: daysAgo(2) + 'T23:00:00Z',
    },
    {
      day: daysAgo(1),
      total_count: 19,
      positive_count: 8,
      negative_count: 8,
      neutral_count: 3,
      categories: { 클래스밸런스: 7, 컨텐츠: 5, 과금BM: 3, 운영소통: 3, PvP: 1 },
      top_keywords: [
        { keyword: '글라디', count: 6 },
        { keyword: '전장', count: 5 },
        { keyword: '버프', count: 4 },
      ],
      updated_at: daysAgo(1) + 'T23:00:00Z',
    },
    {
      day: daysAgo(0),
      total_count: 23,
      positive_count: 5,
      negative_count: 14,
      neutral_count: 4,
      categories: { 클래스밸런스: 8, 과금BM: 5, 서버기술: 4, 운영소통: 3, PvP: 2, 컨텐츠: 1 },
      top_keywords: [
        { keyword: '글라디', count: 6 },
        { keyword: '버프', count: 5 },
        { keyword: '전장', count: 4 },
      ],
      updated_at: new Date().toISOString(),
    },
  ]

  return raw.slice(-days)
}
