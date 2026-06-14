-- =============================================================================
-- Migration : 002_add_board_name.sql
-- Purpose   : voice_raw_posts.board_name 컬럼 추가 (인벤 게시판/직업별 식별)
--             - 수집기(pipeline/src/collectors/inven.py)가 BOARD_NAMES로 기록
--             - 대시보드 ClassBoard(직업별 반응)가 이 컬럼으로 조회/집계
--             - 001 이후 운영 DB에 수동 추가된 컬럼을 마이그레이션으로 추적(드리프트 해소)
-- Created   : 2026-06-14
-- Run       : Supabase 대시보드 SQL Editor에서 직접 실행 (이미 존재해도 무해)
-- =============================================================================

ALTER TABLE voice_raw_posts
    ADD COLUMN IF NOT EXISTS board_name TEXT;  -- '자유', '검성', '수호성' 등 게시판명

-- 직업별 보드 필터링/집계용 인덱스 (board_name 지정된 행만 색인)
CREATE INDEX IF NOT EXISTS idx_voice_posts_board_name
    ON voice_raw_posts(board_name)
    WHERE board_name IS NOT NULL;
