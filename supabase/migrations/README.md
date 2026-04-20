# supabase/migrations

Supabase PostgreSQL 스키마 마이그레이션 파일 모음.

## 적용 방법

**Supabase 대시보드 SQL 에디터:**
파일을 순서대로 복사 · 실행.

**Supabase CLI:**
```bash
supabase db push
```

## TypeScript 타입 자동 생성

스키마 변경 후 `supabase/types.ts`를 최신 상태로 유지하려면:

```bash
npx supabase gen types typescript --project-id YOUR_PROJECT_ID > supabase/types.ts
```

- `YOUR_PROJECT_ID`: Supabase 대시보드 → Project Settings → General → Reference ID
- Supabase CLI 미설치 시: `npm install -g supabase` 또는 `npx` 사용
- **스키마 변경(컬럼 추가/삭제 등)이 있을 때마다 재실행 필요**
- 현재 `supabase/types.ts`는 CLI 없이 수동 작성된 파일 (001 스키마 기준)

## 파일 목록

| 파일 | 설명 |
|------|------|
| `001_voice_tracker.sql` | voice_raw_posts · voice_hourly_stats · voice_daily_stats 테이블 + RLS |
