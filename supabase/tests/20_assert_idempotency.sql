-- 재실행 멱등성 검증 — 파이프라인이 PostgREST로 보내는 것과 같은 SQL로 확인.
--   save_posts():   upsert(on_conflict="source,external_id", ignore_duplicates=True)
--                   → INSERT ... ON CONFLICT (source, external_id) DO NOTHING
--   집계:           upsert(on_conflict="hour"/"day") → INSERT ... ON CONFLICT (...) DO UPDATE
\set ON_ERROR_STOP on

SET ROLE service_role;

CREATE TEMP TABLE batch (source text, external_id text, title text, posted_at timestamptz);
INSERT INTO batch VALUES
    ('inven_aion2', '6388_900', '같은 글', now()),
    ('inven_aion2', '6388_901', '다른 글', now());

-- 1차 실행: 2건 신규
INSERT INTO voice_raw_posts (source, external_id, title, posted_at)
SELECT * FROM batch ON CONFLICT (source, external_id) DO NOTHING;

-- 1차 실행 후 분류 결과가 기록됨
UPDATE voice_raw_posts SET sentiment = 'negative', classified_at = now()
WHERE external_id = '6388_900';

-- 2차 실행(같은 배치 재수집 + 제목이 바뀐 재수집): 0건 신규, 기존 분류 결과 보존
INSERT INTO voice_raw_posts (source, external_id, title, posted_at)
SELECT source, external_id, title || ' (수정됨)', posted_at FROM batch
ON CONFLICT (source, external_id) DO NOTHING;

DO $$
DECLARE n int; s text;
BEGIN
    SELECT count(*) INTO n FROM voice_raw_posts WHERE external_id IN ('6388_900', '6388_901');
    IF n <> 2 THEN RAISE EXCEPTION 'FAIL: 재실행 후 행 수 % (기대 2)', n; END IF;
    SELECT sentiment INTO s FROM voice_raw_posts WHERE external_id = '6388_900';
    IF s IS DISTINCT FROM 'negative' THEN RAISE EXCEPTION 'FAIL: 재수집이 분류 결과를 덮어씀 (%)', s; END IF;
    RAISE NOTICE 'ok: voice_raw_posts 재실행 멱등 (행 수 유지, 분류 결과 보존)';
END $$;

-- 집계 테이블: 같은 시간대를 두 번 upsert해도 1행, 값은 최신으로
INSERT INTO voice_hourly_stats (hour, total_count) VALUES ('2026-10-14 03:00+00', 5)
ON CONFLICT (hour) DO UPDATE SET total_count = EXCLUDED.total_count;
INSERT INTO voice_hourly_stats (hour, total_count) VALUES ('2026-10-14 03:00+00', 7)
ON CONFLICT (hour) DO UPDATE SET total_count = EXCLUDED.total_count;

DO $$
DECLARE n int; t int;
BEGIN
    SELECT count(*), max(total_count) INTO n, t FROM voice_hourly_stats WHERE hour = '2026-10-14 03:00+00';
    IF n <> 1 OR t <> 7 THEN RAISE EXCEPTION 'FAIL: hourly upsert 행 % 값 %', n, t; END IF;
    RAISE NOTICE 'ok: 집계 upsert 멱등 (시간대당 1행, 최신 값)';
END $$;

RESET ROLE;
