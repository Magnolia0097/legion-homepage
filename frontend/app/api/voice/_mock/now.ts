// TODO(다음주말): Supabase 클라이언트로 교체.
// 교체 가이드: frontend/app/api/voice/README.md 참조

export interface Keyword {
  keyword: string
  count: number
}

export interface NowData {
  hour: string
  total_count: number
  positive_count: number
  negative_count: number
  neutral_count: number
  categories: Record<string, number>
  top_keywords: Keyword[]
  updated_at: string
}

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
