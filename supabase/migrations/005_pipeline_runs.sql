-- =============================================================================
-- Migration : 005_pipeline_runs.sql
-- Purpose   : 파이프라인 실행 로그 — 실행마다 1행(시작 시 running → 종료 시 결과로 갱신)
-- Created   : 2026-10-14
-- Status    : ⚠ 운영 미적용 (적용은 승인 후)
-- Run       : Supabase 대시보드 SQL Editor에서 직접 실행
-- =============================================================================
--
-- 왜: 지금까지 실행 결과는 GitHub Actions 로그(보존 90일)에만 있었다. Gemini 키가 차단돼
-- 두 달 넘게 LLM 분류가 0건이었는데도 SQL 한 줄로 확인할 방법이 없었다.
-- 테이블이 없어도 파이프라인은 경고만 남기고 정상 동작한다(src/run_log.py).
--
-- 예시 질의
--   -- 최근 실행 상태와 LLM 성공률
--   SELECT started_at, status, new_count, classified_count, llm_requests, llm_ok, llm_errors
--   FROM pipeline_runs ORDER BY started_at DESC LIMIT 20;
--   -- 일별 성공률
--   SELECT date_trunc('day', started_at AT TIME ZONE 'Asia/Seoul') AS day,
--          count(*) FILTER (WHERE status = 'success')::float / count(*) AS success_rate
--   FROM pipeline_runs GROUP BY 1 ORDER BY 1 DESC;

CREATE TABLE IF NOT EXISTS pipeline_runs (
    run_id             TEXT PRIMARY KEY,          -- Actions: gh-{run_id}-{attempt}, 로컬: local-{uuid}
    trigger            VARCHAR(30),               -- schedule | workflow_dispatch | local
    git_sha            VARCHAR(40),
    started_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at        TIMESTAMPTZ,
    status             VARCHAR(10) NOT NULL DEFAULT 'running'
                       CHECK (status IN ('running', 'success', 'partial', 'failed')),
                       -- partial: 끝까지 돌았지만 일부 오류(수집 실패 페이지·LLM 오류 등)
    classifier_mode    VARCHAR(20),
    model              VARCHAR(50),               -- 설정된 1순위 LLM 모델 (실제 사용 모델은 voice_raw_posts.classified_by_model)

    -- 수집
    collected_count    INT NOT NULL DEFAULT 0,    -- 수집한 오늘 글 (중복 포함)
    new_count          INT NOT NULL DEFAULT 0,    -- 신규 저장
    pages_failed       INT NOT NULL DEFAULT 0,    -- 재시도까지 실패한 목록 페이지
    crawl_retries      INT NOT NULL DEFAULT 0,

    -- 분류
    unclassified_count INT NOT NULL DEFAULT 0,    -- 이번 실행에서 처리 대상으로 가져온 미분류 글
    classified_count   INT NOT NULL DEFAULT 0,
    spam_count         INT NOT NULL DEFAULT 0,
    deferred_count     INT NOT NULL DEFAULT 0,    -- 애매 + LLM 예산 없음 → 다음 실행으로 보류
    failed_count       INT NOT NULL DEFAULT 0,
    llm_requests       INT NOT NULL DEFAULT 0,
    llm_ok             INT NOT NULL DEFAULT 0,
    llm_errors         JSONB,                     -- {"auth": 12, "transient": 1}
    fallback_count     INT NOT NULL DEFAULT 0,    -- invalid_sentiment + category_filtered

    error_count        INT NOT NULL DEFAULT 0,    -- 수집 실패 + LLM 오류 + 단계 예외
    dq_warnings        JSONB,                     -- 데이터 품질 경고 목록
    error_message      TEXT                       -- status='failed'일 때 예외 요약
);

CREATE INDEX IF NOT EXISTS idx_pipeline_runs_started ON pipeline_runs(started_at DESC);

-- 내부 운영 로그 — 공개 키로는 읽기·쓰기 모두 불가 (service_role만, RLS 우회)
ALTER TABLE pipeline_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON pipeline_runs FROM anon, authenticated;
