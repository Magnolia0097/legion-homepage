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
| `002_classification_audit.sql` | classified_by_model 컬럼 + classification_fallback_log 테이블 (분류 품질 측정용) |
| `003_sync_board_name.sql` | ⚠ 운영 미적용 — 수동으로 추가돼 있던 board_name 컬럼을 마이그레이션에 기록 (스키마 드리프트 정리, 운영에선 no-op 예상) |
| `004_restrict_anon_access.sql` | ⚠ 운영 미적용 — anon 키 권한 최소화: 쓰기 권한 회수, voice_raw_posts 컬럼 단위 읽기(author·body 비공개), fallback_log 비공개 |
| `005_pipeline_runs.sql` | ⚠ 운영 미적용 — 실행 로그 테이블(실행당 1행: 상태·건수·LLM 오류·품질 경고). 미적용이어도 파이프라인은 경고만 남기고 동작 |

> ⚠ 표시는 파일만 준비된 상태. 운영 적용은 승인 후 SQL Editor에서 실행하고, 적용 전·후로
> `supabase/checks/rls_audit.sql`을 돌려 결과를 비교한다.

## 검증 (로컬·CI)

`supabase/tests/run.sh`가 빈 Postgres에 Supabase 기본 권한(anon·authenticated·service_role)을
흉내 낸 뒤 마이그레이션을 순서대로 적용하고, `10_assert_*.sql`로 권한을 검증한다.
CI(`.github/workflows/supabase-migrations.yml`)에서 `supabase/**` 변경 시 자동 실행된다.

```bash
PGHOST=localhost PGUSER=postgres PGPASSWORD=... ./supabase/tests/run.sh   # 일회용 DB 전용
```

검증 항목
- `10_assert_anon_access.sql`: 대시보드 조회(컬럼·필터)는 허용 / author·body·fallback_log·pipeline_runs 조회 거부 /
  anon·authenticated의 INSERT·UPDATE·DELETE·TRUNCATE 거부 / service_role 읽기·쓰기 유지
- `20_assert_idempotency.sql`: 같은 배치를 두 번 넣어도 행 수 유지·기존 분류 결과 보존(ON CONFLICT DO NOTHING),
  집계 upsert는 시간대당 1행
