-- =============================================================================
-- Migration : 006_title_cleanup_and_date_repair.sql
-- Purpose   : (1) 인벤 말머리 컬럼 category_tag 추가
--             (2) 제목에 붙어 저장된 '[말머리]', '[댓글 수]', 첨부 아이콘('사진' 등) 정리
--             (3) 날짜 파싱 버그로 잘못 저장된 posted_at 보정
-- Created   : 2026-11-08
-- Status    : 운영 적용 2026-11-08
-- Run       : Supabase 대시보드 SQL Editor에서 직접 실행 (여러 번 실행해도 결과 같음)
-- =============================================================================
--
-- 배경
--   크롤러가 목록의 td.tit 텍스트를 통째로 제목으로 저장해 "[잡담]제목[12]사진"처럼 들어갔다
--   (91,024건 중 말머리 87,072건, 댓글 수 62,908건). 분류·대시보드 표시에 잡음이 섞였다.
--   크롤러는 이제 a.subject-link 안의 제목만 쓰고 말머리는 category_tag에 따로 둔다.
--
--   날짜는 두 가지가 틀렸다.
--   a) 인벤은 24시간 이내 글을 'HH:MM'으로만 보여주는데 크롤러가 무조건 오늘 날짜를 붙여,
--      전날 밤 글이 미래 시각으로 저장됐다 (6,209건).
--   b) 지난 글의 'MM-DD' 표기를 못 읽어 수집 시각(초 단위까지)이 들어갔다 (4,377건).
--      정상 파싱 결과는 항상 0초라서 '초가 0이 아님'으로 정확히 골라낼 수 있다.
--      원래 날짜는 남아 있지 않으므로, 같은 게시판에서 글 번호가 바로 앞뒤인 정상 글의
--      시각으로 선형 보간한다 (인벤 글 번호는 게시판별로 시간순 증가). 결과는 분 단위로 내려
--      다시 실행해도 보정 대상에 걸리지 않게 한다.

-- -----------------------------------------------------------------------------
-- 1. 말머리 컬럼
-- -----------------------------------------------------------------------------
ALTER TABLE voice_raw_posts
    ADD COLUMN IF NOT EXISTS category_tag TEXT;  -- 인벤 말머리: 일반/잡담/질문/스샷 ...

-- -----------------------------------------------------------------------------
-- 2. 제목 정리 (크롤러 clean_title()과 같은 규칙, 기존 데이터는 알려진 말머리만)
-- -----------------------------------------------------------------------------
UPDATE voice_raw_posts
SET category_tag = COALESCE(
        category_tag,
        substring(title FROM '^\[(일반|잡담|질문|스샷|기타|소식|정보|팁|공략|이벤트)\]')
    ),
    title = btrim(regexp_replace(regexp_replace(regexp_replace(title,
                '^\[(일반|잡담|질문|스샷|기타|소식|정보|팁|공략|이벤트)\]\s*', ''),
                '\s*\[\d+\](사진|비디오|동영상)*$', ''),
                '(\S)(사진|비디오|동영상)+$', '\1'))
WHERE title ~ '^\[(일반|잡담|질문|스샷|기타|소식|정보|팁|공략|이벤트)\]'
   OR title ~ '\[\d+\](사진|비디오|동영상)*$'
   OR title ~ '\S(사진|비디오|동영상)+$';

-- -----------------------------------------------------------------------------
-- 3a. 'HH:MM'을 오늘로 해석해 미래가 된 글 → 하루 전
-- -----------------------------------------------------------------------------
UPDATE voice_raw_posts
SET posted_at = posted_at - INTERVAL '1 day'
WHERE posted_at > collected_at + INTERVAL '5 minutes';

-- -----------------------------------------------------------------------------
-- 3b. 날짜 파싱 실패로 수집 시각이 들어간 글 → 같은 게시판 앞뒤 글 번호로 보간
--     (조인 없이 윈도 함수로 직전·직후 정상 글을 찾는다)
-- -----------------------------------------------------------------------------
WITH p AS (
    SELECT id,
           split_part(external_id, '_', 1)          AS board,
           split_part(external_id, '_', 2)::bigint  AS num,
           posted_at                                AS pa,
           date_part('second', posted_at) <> 0      AS bad
    FROM voice_raw_posts
    WHERE source = 'inven_aion2' AND external_id ~ '^\d+_\d+$'
), g AS (
    SELECT *,
           count(*) FILTER (WHERE NOT bad) OVER (PARTITION BY board ORDER BY num
               ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS g_lo,
           count(*) FILTER (WHERE NOT bad) OVER (PARTITION BY board ORDER BY num DESC
               ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS g_hi
    FROM p
), x AS (
    SELECT *,
           first_value(CASE WHEN NOT bad THEN num END) OVER (PARTITION BY board, g_lo ORDER BY num)      AS lo_num,
           first_value(CASE WHEN NOT bad THEN pa END)  OVER (PARTITION BY board, g_lo ORDER BY num)      AS lo_pa,
           first_value(CASE WHEN NOT bad THEN num END) OVER (PARTITION BY board, g_hi ORDER BY num DESC) AS hi_num,
           first_value(CASE WHEN NOT bad THEN pa END)  OVER (PARTITION BY board, g_hi ORDER BY num DESC) AS hi_pa
    FROM g
), est AS (
    SELECT id,
           CASE
               WHEN lo_pa IS NOT NULL AND hi_pa IS NOT NULL AND hi_num > lo_num
                   THEN lo_pa + (hi_pa - lo_pa) * ((num - lo_num)::float8 / (hi_num - lo_num))
               ELSE COALESCE(lo_pa, hi_pa)
           END AS new_pa
    FROM x
    WHERE bad
)
UPDATE voice_raw_posts v
SET posted_at = date_trunc('minute', est.new_pa)
FROM est
WHERE v.id = est.id AND est.new_pa IS NOT NULL;

-- 보간 결과가 수집 시각보다 늦으면(앞뒤 정상 글 간격이 넓을 때) 수집 시각으로 자른다.
-- 수집할 때 이미 올라와 있던 글이므로 수집 시각이 상한이다.
UPDATE voice_raw_posts
SET posted_at = date_trunc('minute', collected_at)
WHERE posted_at > collected_at + INTERVAL '5 minutes';
