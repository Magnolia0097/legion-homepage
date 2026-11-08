-- =============================================================================
-- Migration : 003_sync_board_name.sql
-- Purpose   : 스키마 드리프트 정리 — voice_raw_posts.board_name 컬럼을 마이그레이션에 명시
-- Created   : 2026-10-14
-- Status    : ⚠ 운영 미적용 (적용은 승인 후). 운영 DB에는 이미 컬럼이 있으므로 no-op 예상
-- Run       : Supabase 대시보드 SQL Editor에서 직접 실행
-- =============================================================================
--
-- 배경: 크롤러(src/collectors/inven.py)는 board_name을 INSERT하고 대시보드
-- (ClassBoard.tsx)는 board_name으로 필터하는데, 001/002 어디에도 이 컬럼이 없다.
-- 운영 DB에는 SQL Editor에서 수동으로 추가된 것으로 보인다(파이프라인 INSERT가 201 성공).
-- 마이그레이션만으로 DB를 재현할 수 있도록 IF NOT EXISTS로 기록해 둔다.

ALTER TABLE voice_raw_posts
    ADD COLUMN IF NOT EXISTS board_name TEXT;  -- '자유', '수호성' 등 인벤 게시판 이름

