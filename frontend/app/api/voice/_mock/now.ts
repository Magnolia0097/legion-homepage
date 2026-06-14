// TODO(다음주말): Supabase 클라이언트로 교체.
// 교체 가이드: frontend/app/api/voice/README.md 참조
// 타입 단일 출처: frontend/types/index.ts (이 파일은 dev 전용 mock 데이터만 담당)

import type { NowData } from '@/types'

export function getMockNow(): NowData {
  const now = new Date().toISOString()
  return {
    hour: now,
    total_count: 23,
    positive_count: 5,
    negative_count: 14,
    neutral_count: 4,
    categories: {
      클래스밸런스: 8,
      과금BM: 5,
      서버기술: 4,
      운영소통: 3,
      PvP: 2,
      컨텐츠: 1,
    },
    top_keywords: [
      { keyword: '글라디', count: 6 },
      { keyword: '버프', count: 5 },
      { keyword: '전장', count: 4 },
      { keyword: '클래스', count: 3 },
      { keyword: '너프', count: 3 },
    ],
    updated_at: now,
  }
}
