-- =============================================================================
-- Migration : 001_voice_tracker.sql
-- Purpose   : Aion 2 Voice Tracker 핵심 테이블 생성
--             raw_posts(원본+LLM결과), hourly_stats, daily_stats + RLS 정책
-- Created   : 2026-04-21
-- ADR       : ADR 001 (Supabase 채택), ADR 004 (인벤 Aion 2 1순위 소스)
-- Run       : Supabase 대시보드 SQL Editor에서 직접 실행
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. voice_raw_posts — 원본 게시글 + LLM 분류 결과
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS voice_raw_posts (
    id           BIGSERIAL PRIMARY KEY,
    source       VARCHAR(30)  NOT NULL,  -- 'inven_aion2', 'dcinside_aion2' 등 세분화된 식별자
    external_id  VARCHAR(200) NOT NULL,
    url          TEXT,
    title        TEXT,
    body         TEXT,
    author       VARCHAR(100),
    posted_at    TIMESTAMPTZ  NOT NULL,
    collected_at TIMESTAMPTZ  DEFAULT NOW(),

    -- LLM 분류 결과 (Gemini, 분류 전 NULL)
    sentiment       VARCHAR(10),  -- 'positive' | 'negative' | 'neutral'
    categories      JSONB,        -- ["클래스밸런스", "PvP"]
    issue_summary   TEXT,
    keywords        JSONB,        -- ["글라디", "버프"]
    classified_at   TIMESTAMPTZ,

    UNIQUE(source, external_id)
);

CREATE INDEX idx_voice_posts_posted_at   ON voice_raw_posts(posted_at DESC);
CREATE INDEX idx_voice_posts_sentiment   ON voice_raw_posts(sentiment);
CREATE INDEX idx_voice_posts_source      ON voice_raw_posts(source);
CREATE INDEX idx_voice_posts_classified  ON voice_raw_posts(classified_at)
    WHERE classified_at IS NULL;  -- 부분 인덱스: 미분류 게시글만 빠르게 조회

-- -----------------------------------------------------------------------------
-- 2. voice_hourly_stats — 시간별 집계 (대시보드 "지금" 섹션)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS voice_hourly_stats (
    hour           TIMESTAMPTZ PRIMARY KEY,
    total_count    INT  DEFAULT 0,
    positive_count INT  DEFAULT 0,
    negative_count INT  DEFAULT 0,
    neutral_count  INT  DEFAULT 0,
    categories     JSONB,  -- {"클래스밸런스": 12, "과금": 8}
    top_keywords   JSONB,
    updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 3. voice_daily_stats — 일별 집계 (대시보드 "추이" 섹션)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS voice_daily_stats (
    day            DATE PRIMARY KEY,
    total_count    INT  DEFAULT 0,
    positive_count INT  DEFAULT 0,
    negative_count INT  DEFAULT 0,
    neutral_count  INT  DEFAULT 0,
    categories     JSONB,
    top_keywords   JSONB,
    top_issues     JSONB,  -- 주요 이슈 TOP 5
    updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 4. RLS (Row Level Security)
--    읽기: 공개 (anon key로 접근 가능)
--    쓰기: service role key만 허용 (pipeline에서만 INSERT/UPDATE)
-- -----------------------------------------------------------------------------
ALTER TABLE voice_raw_posts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_hourly_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_daily_stats  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read" ON voice_raw_posts    FOR SELECT USING (true);
CREATE POLICY "Public read" ON voice_hourly_stats FOR SELECT USING (true);
CREATE POLICY "Public read" ON voice_daily_stats  FOR SELECT USING (true);
