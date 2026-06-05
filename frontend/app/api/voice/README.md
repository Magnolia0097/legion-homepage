# Voice API Routes

현재 `_mock/` 데이터 반환 중. 다음 주말에 Supabase 실 데이터로 교체 예정.

## 주의: Static Export 제한

`next.config.ts`의 `output: 'export'` 설정으로 인해 이 API Route는
`next dev` 개발 서버에서만 동작하며, `next build` 정적 빌드에서는 포함되지 않음.

**프로덕션 연결 방법 2가지:**
1. (권장) 현재 Firebase처럼 Supabase JS 클라이언트를 브라우저에서 직접 호출
2. Cloudflare Workers 또는 `@cloudflare/next-on-pages`로 서버 함수 지원

## Mock → 실 데이터 교체 (방법 1: 권장)

### 5단계 가이드

**Step 1: 환경변수 추가**
```
# frontend/.env.local
NEXT_PUBLIC_SUPABASE_URL=https://ospcbkfmsxludkoshcxt.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
```

**Step 2: Supabase 클라이언트 설치**
```bash
cd frontend && npm install @supabase/supabase-js
```

**Step 3: 클라이언트 싱글톤 생성**
```typescript
// frontend/lib/supabase.ts
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
```

**Step 4: `_mock/` import를 Supabase 쿼리로 교체**

`frontend/app/reactions/page.tsx`에서:
```typescript
// Before (mock):
import { getMockNow } from '@/app/api/voice/_mock/now'
const nowData = getMockNow()

// After (real):
import { supabase } from '@/lib/supabase'
const { data: nowData } = await supabase
  .from('voice_hourly_stats')
  .select('*')
  .order('hour', { ascending: false })
  .limit(1)
  .single()
```

**Step 5: Cloudflare Pages 환경변수 설정**
- Cloudflare Dashboard → Pages → nania-ssimdang → Settings → Environment Variables
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` 추가

## 엔드포인트 명세

### GET /api/voice/now
최근 1시간 통계 (`voice_hourly_stats` 최신 1행)

**Response:**
```json
{
  "hour": "2026-05-12T10:00:00.000Z",
  "total_count": 23,
  "positive_count": 5,
  "negative_count": 14,
  "neutral_count": 4,
  "categories": { "클래스밸런스": 8, "과금BM": 5 },
  "top_keywords": [{ "keyword": "글라디", "count": 6 }],
  "updated_at": "2026-05-12T10:30:00.000Z"
}
```

### GET /api/voice/trend?days=7
최근 N일 일별 통계 배열 (`voice_daily_stats`)

### GET /api/voice/issues?limit=5
주요 이슈 TOP N (`voice_raw_posts`에서 집계)
