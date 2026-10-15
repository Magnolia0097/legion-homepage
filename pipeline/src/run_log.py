"""파이프라인 실행 기록 — pipeline_runs 테이블에 실행당 1행.

시작 시 status='running'으로 넣고 종료 시 결과로 갱신한다. 시작만 있고 종료가 없는 행은
도중에 죽은 실행(타임아웃 취소 등)이라는 뜻이 된다.

기록은 부가 기능이라 실패해도 파이프라인을 멈추지 않는다. 테이블이 아직 없으면
(005 마이그레이션 미적용) 경고 한 번만 남기고 이후 기록을 건너뛴다.
"""

from __future__ import annotations

import logging
import os
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone

from .db import get_supabase

logger = logging.getLogger(__name__)

TABLE = "pipeline_runs"


@dataclass
class RunRecord:
    run_id: str
    trigger: str
    git_sha: str | None
    classifier_mode: str
    model: str
    started_at: str = field(default_factory=lambda: datetime.now(tz=timezone.utc).isoformat())
    finished_at: str | None = None
    status: str = "running"

    collected_count: int = 0
    new_count: int = 0
    pages_failed: int = 0
    crawl_retries: int = 0
    date_fallbacks: int = 0  # DB 컬럼 없음 — 요약·품질 경고용

    unclassified_count: int = 0
    classified_count: int = 0
    spam_count: int = 0
    deferred_count: int = 0
    failed_count: int = 0
    llm_requests: int = 0
    llm_ok: int = 0
    llm_retries: int = 0          # DB 컬럼 없음 — 요약용
    llm_avg_latency_ms: float | None = None  # DB 컬럼 없음 — 요약용
    llm_errors: dict = field(default_factory=dict)
    fallback_count: int = 0

    hourly_buckets: int = 0       # DB 컬럼 없음 — 요약용
    daily_buckets: int = 0        # DB 컬럼 없음 — 요약용
    stage_errors: list[str] = field(default_factory=list)  # 단계별 예외 요약
    dq_warnings: list[str] = field(default_factory=list)
    error_message: str | None = None

    @property
    def error_count(self) -> int:
        # 쿼터 소진(429)은 무료 티어에서 예상되는 상태라 오류로 세지 않는다 (llm_errors에는 기록)
        llm = sum(v for k, v in self.llm_errors.items() if k != "quota")
        return self.pages_failed + llm + len(self.stage_errors)

    def finish(self, *, crashed: BaseException | None = None) -> None:
        self.finished_at = datetime.now(tz=timezone.utc).isoformat()
        if crashed is not None:
            self.status = "failed"
            self.error_message = f"{type(crashed).__name__}: {crashed}"[:500]
        else:
            self.status = "partial" if self.error_count else "success"

    def to_row(self) -> dict:
        """pipeline_runs 컬럼에 해당하는 값만."""
        d = asdict(self)
        for key in ("date_fallbacks", "llm_retries", "llm_avg_latency_ms",
                    "hourly_buckets", "daily_buckets", "stage_errors"):
            d.pop(key)
        d["error_count"] = self.error_count
        return d


def new_record(classifier_mode: str, model: str) -> RunRecord:
    """GitHub Actions 환경변수로 실행 식별자를 만든다 (재시도 실행은 attempt로 구분)."""
    gh_run = os.environ.get("GITHUB_RUN_ID")
    if gh_run:
        run_id = f"gh-{gh_run}-{os.environ.get('GITHUB_RUN_ATTEMPT', '1')}"
        trigger = os.environ.get("GITHUB_EVENT_NAME", "unknown")
    else:
        run_id = f"local-{uuid.uuid4().hex[:12]}"
        trigger = "local"
    return RunRecord(
        run_id=run_id, trigger=trigger, git_sha=os.environ.get("GITHUB_SHA"),
        classifier_mode=classifier_mode, model=model,
    )


_table_missing = False


def _is_missing_table(exc: Exception) -> bool:
    text = str(exc)
    return "PGRST205" in text or "42P01" in text or (f"'{TABLE}'" in text and "not find" in text)


def _write(op: str, record: RunRecord) -> None:
    global _table_missing
    if _table_missing:
        return
    try:
        table = get_supabase(use_service_role=True).table(TABLE)
        if op == "insert":
            table.insert(record.to_row()).execute()
        else:
            table.update(record.to_row()).eq("run_id", record.run_id).execute()
    except Exception as exc:  # noqa: BLE001 — 실행 기록 실패가 파이프라인을 멈추면 안 됨
        if _is_missing_table(exc):
            _table_missing = True
            logger.warning("pipeline_runs 테이블 없음 — 005 마이그레이션 적용 전까지 실행 기록 생략")
        else:
            logger.warning("실행 기록(%s) 실패: %s", op, exc)


def start_run(record: RunRecord) -> None:
    _write("insert", record)


def finish_run(record: RunRecord) -> None:
    _write("update", record)
