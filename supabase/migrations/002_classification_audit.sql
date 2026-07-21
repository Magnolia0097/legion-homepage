-- =============================================================================
-- Migration : 002_classification_audit.sql
-- Purpose   : 분류 품질 측정 인프라
--             voice_raw_posts.classified_by_model 컬럼 + classification_fallback_log 테이블
--             (neutral 폴백·카테고리 필터링 발동 빈도를 소급 가능하게 기록)
-- Created   : 2026-07-20
-- Run       : Supabase 대시보드 SQL Editor에서 직접 실행
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. voice_raw_posts.classified_by_model — 실제 분류에 사용된 모델 기록
--    폴백 체인(gemini-2.5-flash-lite → 2.0-flash → 2.5-flash) 중 어떤 모델이
--    처리했는지 남겨 모델별 품질 편차를 측정할 수 있게 함.
--    'local-keyword', 'question-filter' 등 무료 경로 식별자도 동일 컬럼에 저장.
-- -----------------------------------------------------------------------------
ALTER TABLE voice_raw_posts
    ADD COLUMN IF NOT EXISTS classified_by_model VARCHAR(50);

CREATE INDEX IF NOT EXISTS idx_voice_posts_model ON voice_raw_posts(classified_by_model);

-- -----------------------------------------------------------------------------
-- 2. classification_fallback_log — 유효성 폴백 발생 로그
--    fallback_type:
--      'invalid_sentiment' — LLM이 VALID_SENTIMENTS 밖의 값 반환 → neutral 폴백
--      'category_filtered' — VALID_CATEGORIES 밖의 카테고리가 걸러짐
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS classification_fallback_log (
    id            BIGSERIAL PRIMARY KEY,
    post_id       BIGINT REFERENCES voice_raw_posts(id) ON DELETE SET NULL,
    title_prefix  VARCHAR(60),           -- 게시글 제목 앞부분 (빠른 육안 확인용)
    fallback_type VARCHAR(30) NOT NULL,  -- 'invalid_sentiment' | 'category_filtered'
    raw_value     TEXT,                  -- 원본 sentiment 값 또는 걸러진 카테고리 목록(JSON)
    model         VARCHAR(50),           -- 해당 분류에 실제 사용된 모델
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_fallback_log_created ON classification_fallback_log(created_at DESC);
CREATE INDEX idx_fallback_log_type    ON classification_fallback_log(fallback_type);

-- -----------------------------------------------------------------------------
-- 3. RLS (Row Level Security)
--    읽기: 공개 (anon key로 접근 가능)
--    쓰기: service role key만 허용 (pipeline에서만 INSERT) — 001과 동일 정책
-- -----------------------------------------------------------------------------
ALTER TABLE classification_fallback_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read" ON classification_fallback_log FOR SELECT USING (true);
