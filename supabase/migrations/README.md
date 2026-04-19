# supabase/migrations

Supabase PostgreSQL 스키마 마이그레이션 파일 모음.

## 적용 방법

**Supabase 대시보드 SQL 에디터:**
파일을 순서대로 복사 · 실행.

**Supabase CLI:**
```bash
supabase db push
```

## 파일 목록

| 파일 | 설명 |
|------|------|
| `001_voice_tracker.sql` | voice_raw_posts · voice_hourly_stats · voice_daily_stats 테이블 + RLS |
