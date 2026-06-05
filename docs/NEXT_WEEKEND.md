# 다음 주말 작업 가이드 — Supabase 연결 + 파이프라인 첫 실행

## 순서

### 1. WSL에서 파이프라인 한 사이클 실행

```bash
# 1-1. .env 세팅 (없으면 생성)
cp pipeline/.env.example pipeline/.env
# 파일 열어서 아래 값 채우기:
#   SUPABASE_URL=https://ospcbkfmsxludkoshcxt.supabase.co
#   SUPABASE_ANON_KEY=...
#   SUPABASE_SERVICE_ROLE_KEY=...
#   GEMINI_API_KEY=...

# 1-2. Supabase 스키마 실행 (최초 1회만)
# → Supabase 대시보드 > SQL Editor > 새 쿼리
# → supabase/migrations/001_voice_tracker.sql 내용 전체 붙여넣기 > 실행

# 1-3. 파이프라인 실행
cd /home/user/legion-homepage/pipeline
uv run python scripts/run_pipeline.py
```

### 2. Supabase에 데이터 적재 확인

Supabase 대시보드 > Table Editor:
- `voice_raw_posts`: 글 목록 확인 (인벤 수집 결과)
- `voice_hourly_stats`: 집계 결과 확인
- 없으면 파이프라인 에러 로그 확인

### 3. frontend Supabase 연결

```bash
cd frontend
npm install @supabase/supabase-js

# .env.local 생성
echo "NEXT_PUBLIC_SUPABASE_URL=https://ospcbkfmsxludkoshcxt.supabase.co" >> .env.local
echo "NEXT_PUBLIC_SUPABASE_ANON_KEY=여기에_anon_key_입력" >> .env.local
```

`frontend/lib/supabase.ts` 신규 생성:
```typescript
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
```

### 4. 반응 페이지 Mock → 실 데이터 교체

`frontend/app/reactions/page.tsx` 상단 수정:

```typescript
// 아래 3줄 제거
import { getMockNow } from '@/app/api/voice/_mock/now'
import { getMockTrend } from '@/app/api/voice/_mock/trend'
import { getMockIssues } from '@/app/api/voice/_mock/issues'

// 아래로 교체
import { supabase } from '@/lib/supabase'
```

`useEffect` 내용도 Supabase 쿼리로 교체 (README 참고):
```typescript
useEffect(() => {
  Promise.all([
    supabase.from('voice_hourly_stats').select('*').order('hour', { ascending: false }).limit(1).single(),
    supabase.from('voice_daily_stats').select('*').order('day', { ascending: false }).limit(7),
  ]).then(([{ data: now }, { data: trend }]) => {
    if (now) setNowData(now)
    if (trend) setTrendData([...trend].reverse())
    setLoading(false)
  })
}, [])
```

이슈 데이터는 `voice_raw_posts` 집계가 필요하므로 추가 작업 필요.
우선 Now + Trend만 연결하고 Issues는 Mock 유지해도 OK.

### 5. 배포 확인

```bash
cd frontend
npm run build   # 빌드 성공 확인
npm run deploy  # Cloudflare Pages 배포
```

Cloudflare Pages 환경변수 설정:
- Dashboard → Pages → nania-ssimdang → Settings → Environment variables
- `NEXT_PUBLIC_SUPABASE_URL` 추가
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` 추가

## 완료 체크리스트

- [ ] `pipeline/.env` 생성 + 키 입력
- [ ] Supabase SQL 스키마 실행 (`001_voice_tracker.sql`)
- [ ] 파이프라인 1회 실행 → voice_raw_posts 데이터 확인
- [ ] Gemini 분류 결과 확인 (sentiment NOT NULL 행 존재)
- [ ] hourly_stats 집계 확인
- [ ] frontend Supabase 클라이언트 설치 + .env.local 설정
- [ ] 반응 페이지 실 데이터 연결 (Now + Trend)
- [ ] `npm run build` 성공
- [ ] Cloudflare Pages 배포 성공
- [ ] 모바일에서 /reactions 페이지 확인
