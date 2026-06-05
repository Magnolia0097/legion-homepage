# 10 - 프론트엔드 대시보드 설계

## What

"반응" 탭 — Aion 2 여론 모니터링 대시보드.
3개 섹션(지금 상황 / 추이 / 주요 이슈)으로 구성.
현재는 Mock 데이터 사용, 다음 주말에 Supabase 연결 예정.

## Why

- 길드 마스터(주찬)의 실사용 도구 — 패치 직후 여론 변화를 빠르게 파악
- 실사용자 있는 서비스 = 토이 프로젝트 아님 (포트폴리오 차별화)
- 관련 ADR: 002(모노레포), 004(저작권 — 원문 노출 금지)

## How

### 파일 구조

```
frontend/
├── app/
│   ├── reactions/
│   │   └── page.tsx          # '반응' 탭 페이지 (Client Component)
│   └── api/voice/
│       ├── _mock/            # Mock 데이터 (언더스코어로 private 표시)
│       │   ├── now.ts
│       │   ├── trend.ts
│       │   └── issues.ts
│       ├── now/route.ts      # GET /api/voice/now  (next dev 전용)
│       ├── trend/route.ts    # GET /api/voice/trend (next dev 전용)
│       ├── issues/route.ts   # GET /api/voice/issues (next dev 전용)
│       └── README.md         # 실 데이터 교체 가이드
└── components/voice/
    ├── NowStats.tsx          # 지금 상황 카드 3개 + PieChart
    ├── TrendChart.tsx        # 7일 추이 LineChart
    ├── IssueCard.tsx         # 이슈 카드 1개
    └── SentimentBadge.tsx    # 긍정/부정/중립 배지
```

### 데이터 흐름

```
Mock 데이터(_mock/*.ts) → page.tsx useEffect → 컴포넌트 props → 화면
                                    ↓ (다음 주말)
Supabase JS Client → page.tsx useEffect → 컴포넌트 props → 화면
```

### Client Component 선택 이유

`output: 'export'` (정적 빌드) 제약으로 Server Component에서 API Route 호출 불가.
또한 recharts는 DOM을 사용하므로 브라우저 환경 필수.
→ `'use client'` + `useEffect` 패턴 채택.

Firebase와 동일한 방식: 브라우저에서 직접 외부 서비스 호출.

### Mock → 실 데이터 교체 전략

`page.tsx` 상단의 import 3줄만 변경:

```typescript
// Before
import { getMockNow } from '@/app/api/voice/_mock/now'
const nowData = getMockNow()

// After (Supabase 직접 호출)
import { supabase } from '@/lib/supabase'
const { data: nowData } = await supabase
  .from('voice_hourly_stats')
  .select('*')
  .order('hour', { ascending: false })
  .limit(1)
  .single()
```

상세 가이드: `frontend/app/api/voice/README.md` 참조

### 저작권 준수 (ADR 004)

- 원문 제목/본문 절대 노출 안 함
- LLM이 생성한 `issue_summary`만 화면에 표시 (2차 저작물)
- "관련 글 보기" 링크만 제공 → 인벤 원문 접근은 사용자 직접

## 디자인 원칙

- CSS 변수(`var(--bg-card)`, `var(--gold-light)` 등) 사용 → 다크/라이트 모드 자동 지원
- 감성 색상 일관성: 긍정=#81c784, 부정=#e05050, 중립=#7a6030
- 모바일 반응형: `grid-cols-1 md:grid-cols-3` 패턴

## 주의사항

- `next dev`에서만 API Route 동작 (`/api/voice/*`)
- recharts는 `'use client'` 필수
- BottomNav가 6+1개 탭이 됨 → 좁은 화면에서 약간 빡빡

## 다음 학습

`docs/learning/11-supabase-integration.md` (실 데이터 연결, 다음 주말 작업)
