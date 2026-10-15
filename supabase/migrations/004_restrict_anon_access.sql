-- =============================================================================
-- Migration : 004_restrict_anon_access.sql
-- Purpose   : anon(공개) 키 권한 최소화 — 대시보드가 실제로 쓰는 읽기 권한만 남김
-- Created   : 2026-10-14
-- Status    : ⚠ 운영 미적용 (적용은 승인 후)
-- Run       : Supabase 대시보드 SQL Editor에서 직접 실행 (트랜잭션 1개)
-- Verify    : supabase/checks/rls_audit.sql 로 적용 전·후 권한 비교
-- Rollback  : 파일 하단 주석 참고
-- =============================================================================
--
-- 점검 결과 (001·002 기준):
--   ✅ 쓰기: 4개 테이블 모두 RLS 활성 + 쓰기 정책 없음 → anon INSERT/UPDATE/DELETE는
--           PostgREST에서 이미 거부된다. 다만 Supabase 기본값이 anon에게 테이블 ALL 권한을
--           GRANT하므로 "RLS 하나에만 의존"하는 상태다. RLS가 실수로 꺼지면 바로 쓰기가 열린다.
--           (TRUNCATE는 RLS 적용 대상이 아님 — PostgREST로는 호출 불가하지만 권한은 남아 있음)
--   ⚠ 읽기: voice_raw_posts "Public read"가 전 컬럼 공개 → author(작성자 닉네임)·body까지
--           anon 키로 대량 조회 가능. 대시보드는 아래 8개 컬럼만 사용한다.
--   ⚠ 읽기: classification_fallback_log "Public read" — 대시보드 미사용, 제목 일부 포함.
--
-- 대시보드(frontend)가 anon으로 조회하는 컬럼 (2026-10-14 기준 전수 확인):
--   reactions/page.tsx : voice_raw_posts(id, title, url, sentiment, issue_summary)
--                        + 필터 classified_at, posted_at / voice_hourly_stats(*) / voice_daily_stats(*)
--   ClassBoard.tsx     : voice_raw_posts(id, board_name, sentiment, title, url)
--                        + 필터 board_name, classified_at, posted_at
--   ※ 컬럼 단위 GRANT 이후 voice_raw_posts를 select('*')로 조회하면 permission denied가 난다.
--     새 컬럼을 대시보드에 노출하려면 아래 GRANT 목록에 추가해야 한다.
--
-- 파이프라인은 service_role 키(BYPASSRLS)로만 접근하므로 영향 없음.

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. 공개 역할의 쓰기 권한 명시적 회수 (RLS와 이중 방어)
-- -----------------------------------------------------------------------------
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
    ON voice_raw_posts, voice_hourly_stats, voice_daily_stats, classification_fallback_log
    FROM anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. voice_raw_posts — 컬럼 단위 읽기 권한
--    공개: 대시보드 표시·필터에 필요한 컬럼만
--    비공개: author(작성자), body(본문 원문), external_id, collected_at,
--            categories/keywords(대시보드 미사용), classified_by_model(내부 측정용)
-- -----------------------------------------------------------------------------
REVOKE SELECT ON voice_raw_posts FROM anon, authenticated;
GRANT SELECT (id, title, url, board_name, posted_at, sentiment, issue_summary, classified_at)
    ON voice_raw_posts TO anon, authenticated;

-- RLS 행 정책("Public read" USING (true))은 그대로 둔다 — 행은 전부 공개, 컬럼만 제한.

-- -----------------------------------------------------------------------------
-- 3. classification_fallback_log — 공개 읽기 제거 (내부 측정 로그)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public read" ON classification_fallback_log;
REVOKE SELECT ON classification_fallback_log FROM anon, authenticated;

COMMIT;

-- -----------------------------------------------------------------------------
-- Rollback (문제 시 SQL Editor에서 실행)
-- -----------------------------------------------------------------------------
-- BEGIN;
-- GRANT SELECT ON voice_raw_posts TO anon, authenticated;
-- GRANT SELECT ON classification_fallback_log TO anon, authenticated;
-- CREATE POLICY "Public read" ON classification_fallback_log FOR SELECT USING (true);
-- COMMIT;
-- (쓰기 권한은 되돌리지 않는다 — 원래도 RLS로 막혀 있던 권한)
