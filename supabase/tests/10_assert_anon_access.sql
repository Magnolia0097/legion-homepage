-- anon(공개 키)·service_role 권한 검증 — 모든 마이그레이션 적용 후 실행.
-- 실패 시 RAISE EXCEPTION → psql ON_ERROR_STOP으로 비정상 종료.
\set ON_ERROR_STOP on

CREATE SCHEMA rls_test;
GRANT USAGE ON SCHEMA rls_test TO anon, authenticated, service_role;

-- q 실행이 권한 오류(42501)로 거부되면 통과, 성공하거나 다른 오류면 실패
CREATE FUNCTION rls_test.expect_denied(q text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    EXECUTE q;
    RAISE EXCEPTION 'FAIL: expected permission denied, but succeeded → %', q;
EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'ok (denied): %', left(q, 90);
END $$;

CREATE FUNCTION rls_test.expect_ok(q text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    EXECUTE q;
    RAISE NOTICE 'ok (allowed): %', left(q, 90);
END $$;

-- 픽스처 (마이그레이션 실행 역할 = postgres)
INSERT INTO voice_raw_posts (source, external_id, url, title, body, author, posted_at, board_name,
                             sentiment, issue_summary, classified_at)
VALUES ('inven_aion2', '6388_1', 'https://example.invalid/1', '테스트 제목', '본문', '작성자닉',
        now(), '자유', 'neutral', '요약', now());

-- ── anon: 대시보드가 쓰는 조회는 그대로 동작해야 함 ─────────────────────────
SET ROLE anon;
SELECT rls_test.expect_ok($q$
    SELECT id, title, url, sentiment, issue_summary FROM voice_raw_posts
    WHERE classified_at IS NOT NULL AND posted_at >= now() - interval '1 day'
    ORDER BY posted_at DESC LIMIT 200 $q$);
SELECT rls_test.expect_ok($q$
    SELECT id, board_name, sentiment, title, url FROM voice_raw_posts
    WHERE board_name IS NOT NULL AND classified_at IS NOT NULL ORDER BY posted_at DESC $q$);
SELECT rls_test.expect_ok($q$ SELECT * FROM voice_hourly_stats ORDER BY hour DESC LIMIT 1 $q$);
SELECT rls_test.expect_ok($q$ SELECT * FROM voice_daily_stats ORDER BY day DESC LIMIT 7 $q$);

-- ── anon: 개인정보·원문 컬럼과 내부 테이블은 거부 ────────────────────────────
SELECT rls_test.expect_denied($q$ SELECT author FROM voice_raw_posts $q$);
SELECT rls_test.expect_denied($q$ SELECT body FROM voice_raw_posts $q$);
SELECT rls_test.expect_denied($q$ SELECT * FROM voice_raw_posts $q$);
SELECT rls_test.expect_denied($q$ SELECT * FROM classification_fallback_log $q$);

-- ── anon: 모든 쓰기 거부 ─────────────────────────────────────────────────────
SELECT rls_test.expect_denied($q$
    INSERT INTO voice_raw_posts (source, external_id, posted_at) VALUES ('x', 'y', now()) $q$);
SELECT rls_test.expect_denied($q$ UPDATE voice_raw_posts SET sentiment = 'positive' $q$);
SELECT rls_test.expect_denied($q$ DELETE FROM voice_raw_posts $q$);
SELECT rls_test.expect_denied($q$ TRUNCATE voice_raw_posts CASCADE $q$);
SELECT rls_test.expect_denied($q$ INSERT INTO voice_hourly_stats (hour) VALUES (now()) $q$);
SELECT rls_test.expect_denied($q$ DELETE FROM voice_daily_stats $q$);
SELECT rls_test.expect_denied($q$
    INSERT INTO classification_fallback_log (fallback_type) VALUES ('x') $q$);
SELECT rls_test.expect_denied($q$ SELECT * FROM pipeline_runs $q$);
SELECT rls_test.expect_denied($q$ INSERT INTO pipeline_runs (run_id) VALUES ('x') $q$);
RESET ROLE;

-- authenticated(Supabase Auth 로그인 사용자)도 anon과 동일해야 함 — 이 서비스는 Supabase Auth 미사용
SET ROLE authenticated;
SELECT rls_test.expect_denied($q$ SELECT author FROM voice_raw_posts $q$);
SELECT rls_test.expect_denied($q$ UPDATE voice_raw_posts SET sentiment = 'positive' $q$);
RESET ROLE;

-- ── service_role(파이프라인): 기존 동작 유지 ─────────────────────────────────
SET ROLE service_role;
SELECT rls_test.expect_ok($q$ SELECT author, body FROM voice_raw_posts $q$);
SELECT rls_test.expect_ok($q$
    INSERT INTO classification_fallback_log (fallback_type, raw_value) VALUES ('invalid_sentiment', 'x') $q$);
SELECT rls_test.expect_ok($q$
    UPDATE voice_raw_posts SET sentiment = 'negative', classified_by_model = 'local-keyword' $q$);
SELECT rls_test.expect_ok($q$
    INSERT INTO pipeline_runs (run_id, trigger) VALUES ('gh-1-1', 'schedule') $q$);
SELECT rls_test.expect_ok($q$
    UPDATE pipeline_runs SET status = 'success', finished_at = now(), llm_errors = '{"auth": 3}'
    WHERE run_id = 'gh-1-1' $q$);
RESET ROLE;

DROP SCHEMA rls_test CASCADE;
