// TODO(다음주말): Supabase 클라이언트로 교체.
// 교체 가이드: frontend/app/api/voice/README.md 참조

export interface RecentPost {
  url: string
  posted_at: string
}

export interface Issue {
  issue_summary: string
  mention_count: number
  sentiment: 'positive' | 'negative' | 'neutral'
  keywords: string[]
  recent_posts: RecentPost[]
}

function hoursAgo(h: number): string {
  const d = new Date()
  d.setHours(d.getHours() - h)
  return d.toISOString()
}

const ALL_ISSUES: Issue[] = [
  {
    issue_summary: '글라디에이터 버프 이후 전장 클래스 밸런스 체감 불만 급증',
    mention_count: 47,
    sentiment: 'negative',
    keywords: ['글라디', '버프', '전장', '밸런스'],
    recent_posts: [
      { url: 'https://www.inven.co.kr/board/aion2/6388/88555', posted_at: hoursAgo(1) },
      { url: 'https://www.inven.co.kr/board/aion2/6388/88512', posted_at: hoursAgo(3) },
      { url: 'https://www.inven.co.kr/board/aion2/6388/88476', posted_at: hoursAgo(5) },
    ],
  },
  {
    issue_summary: '인스턴스 서버 불안정 현상 반복 보고 및 보상 요청',
    mention_count: 31,
    sentiment: 'negative',
    keywords: ['서버', '인스턴스', '렉', '보상'],
    recent_posts: [
      { url: 'https://www.inven.co.kr/board/aion2/6388/88540', posted_at: hoursAgo(2) },
      { url: 'https://www.inven.co.kr/board/aion2/6388/88503', posted_at: hoursAgo(6) },
    ],
  },
  {
    issue_summary: '신규 이벤트 재화 보상이 타 게임 대비 현저히 낮다는 논란',
    mention_count: 28,
    sentiment: 'negative',
    keywords: ['이벤트', '보상', '재화', '과금'],
    recent_posts: [
      { url: 'https://www.inven.co.kr/board/aion2/6388/88532', posted_at: hoursAgo(4) },
      { url: 'https://www.inven.co.kr/board/aion2/6388/88495', posted_at: hoursAgo(8) },
      { url: 'https://www.inven.co.kr/board/aion2/6388/88461', posted_at: hoursAgo(12) },
    ],
  },
  {
    issue_summary: '초반 레벨링 구간 클래스별 속도 차이 개선 요청',
    mention_count: 22,
    sentiment: 'neutral',
    keywords: ['레벨링', '클래스', '퀘스트', '속도'],
    recent_posts: [
      { url: 'https://www.inven.co.kr/board/aion2/6388/88520', posted_at: hoursAgo(5) },
      { url: 'https://www.inven.co.kr/board/aion2/6388/88488', posted_at: hoursAgo(10) },
    ],
  },
  {
    issue_summary: '다음 패치 길드전 시스템 업데이트에 대한 기대 의견',
    mention_count: 18,
    sentiment: 'positive',
    keywords: ['길드전', '패치', '기대', '업데이트'],
    recent_posts: [
      { url: 'https://www.inven.co.kr/board/aion2/6388/88498', posted_at: hoursAgo(7) },
      { url: 'https://www.inven.co.kr/board/aion2/6388/88465', posted_at: hoursAgo(14) },
    ],
  },
]

export function getMockIssues(limit: number = 5): Issue[] {
  return ALL_ISSUES.slice(0, limit)
}
