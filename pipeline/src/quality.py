"""실행 후 데이터 품질 체크.

DB에서 지표를 모으는 부분(collect_metrics)과 경고를 판정하는 부분(evaluate)을 나눠,
판정 규칙은 DB 없이 테스트한다. 체크 실패(조회 오류 등)는 파이프라인을 멈추지 않는다.

체크 항목
- 필수 컬럼 null: 최근 24시간 수집분의 title·url·posted_at·board_name
- 중복: 최근 수집분의 (source, external_id) 중복 — UNIQUE 제약이 운영 DB에 실제로 있는지까지 확인
  (이 프로젝트는 마이그레이션과 운영 스키마가 어긋난 전례가 있다: board_name)
- 미래 시각 posted_at: 날짜 파싱 오류 신호
- neutral 비율 급변: 최근 24시간 vs 직전 7일 (게시 시각 기준, spam 제외)
- 미분류 적체: 애매한 글이 LLM 예산 부족·오류로 계속 보류되면 쌓인다
- 실행 지표: LLM 전면 실패·인증 오류, 수집 실패 페이지, 날짜 파싱 폴백
"""

from __future__ import annotations

import logging
from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

from .db import get_supabase
from .run_log import RunRecord

logger = logging.getLogger(__name__)

REQUIRED_COLUMNS = ("title", "url", "posted_at", "board_name")
SENTIMENTS = ("positive", "negative", "neutral")


@dataclass(frozen=True)
class Thresholds:
    neutral_shift: float = 0.15      # 비율 차이(15%p) 이상이면 경고
    min_posts_for_ratio: int = 30    # 표본이 이보다 적으면 비율 비교 생략
    backlog_warn: int = 500          # 미분류 적체 경고 기준
    future_tolerance: timedelta = timedelta(minutes=10)


@dataclass
class Metrics:
    window_rows: int = 0
    null_counts: dict[str, int] = field(default_factory=dict)
    duplicate_keys: int = 0
    future_posted_at: int = 0
    neutral_recent: tuple[int, int] | None = None    # (neutral, 전체) 최근 24h
    neutral_baseline: tuple[int, int] | None = None  # (neutral, 전체) 직전 7일
    backlog: int | None = None


@dataclass(frozen=True)
class Finding:
    level: str  # "critical" | "warning"
    code: str
    message: str

    def __str__(self) -> str:
        return f"[{self.level}] {self.message}"


def _ratio(pair: tuple[int, int] | None) -> float | None:
    if not pair or not pair[1]:
        return None
    return pair[0] / pair[1]


def evaluate(m: Metrics, run: RunRecord, th: Thresholds = Thresholds()) -> list[Finding]:
    """지표 → 경고 목록 (순수 함수)."""
    out: list[Finding] = []

    # ── 실행 지표 ──
    if run.llm_errors.get("auth"):
        out.append(Finding("critical", "llm_auth",
                           f"Gemini 인증 오류 {run.llm_errors['auth']}건 — API 키 차단·만료 확인 필요"))
    if run.llm_requests and not run.llm_ok:
        out.append(Finding("critical", "llm_all_failed",
                           f"Gemini 요청 {run.llm_requests}건 전부 실패 — 애매한 글은 키워드 폴백/보류로만 처리됨"))
    if run.pages_failed:
        out.append(Finding("warning", "crawl_pages_failed",
                           f"수집 실패 페이지 {run.pages_failed}개 (재시도 소진)"))
    if run.date_fallbacks:
        out.append(Finding("warning", "date_parse_fallback",
                           f"날짜 파싱 실패 {run.date_fallbacks}건 — posted_at이 수집 시각으로 저장됨"))

    # ── 테이블 지표 ──
    for col, n in m.null_counts.items():
        if n:
            out.append(Finding("warning", f"null_{col}",
                               f"최근 24h 수집분 {m.window_rows}건 중 {col} 누락 {n}건"))
    if m.duplicate_keys:
        out.append(Finding("critical", "duplicate_keys",
                           f"(source, external_id) 중복 {m.duplicate_keys}건 — UNIQUE 제약 확인 필요"))
    if m.future_posted_at:
        out.append(Finding("warning", "future_posted_at",
                           f"posted_at이 미래인 글 {m.future_posted_at}건 — 날짜 파싱 확인"))

    recent, base = _ratio(m.neutral_recent), _ratio(m.neutral_baseline)
    if (recent is not None and base is not None
            and m.neutral_recent[1] >= th.min_posts_for_ratio
            and m.neutral_baseline[1] >= th.min_posts_for_ratio
            and abs(recent - base) >= th.neutral_shift):
        out.append(Finding("warning", "neutral_shift",
                           f"neutral 비율 급변: 최근 24h {recent:.0%} vs 직전 7일 {base:.0%} "
                           f"(n={m.neutral_recent[1]}/{m.neutral_baseline[1]})"))

    if m.backlog is not None and m.backlog >= th.backlog_warn:
        out.append(Finding("warning", "backlog",
                           f"미분류 적체 {m.backlog}건 — 애매한 글이 LLM 예산·오류로 계속 보류되는 중"))
    return out


# ── DB 지표 수집 ──────────────────────────────────────────────────────────────

_PAGE = 1000


def _count(db, build) -> int:
    resp = build(db.table("voice_raw_posts").select("id", count="exact", head=True)).execute()
    return resp.count or 0


def _neutral_pair(db, since: datetime, until: datetime) -> tuple[int, int]:
    def window(q):
        return (q.gte("posted_at", since.isoformat()).lt("posted_at", until.isoformat())
                .not_.is_("classified_at", "null"))

    total = _count(db, lambda q: window(q).in_("sentiment", list(SENTIMENTS)))
    neutral = _count(db, lambda q: window(q).eq("sentiment", "neutral"))
    return neutral, total


def collect_metrics(now: datetime | None = None, th: Thresholds = Thresholds()) -> Metrics:
    now = now or datetime.now(tz=timezone.utc)
    db = get_supabase(use_service_role=True)
    m = Metrics()

    # 최근 24시간 수집분 (id 순 페이지네이션 — PostgREST 1000행 상한 대비)
    since = (now - timedelta(hours=24)).isoformat()
    rows: list[dict] = []
    last_id = 0
    while True:
        page = (
            db.table("voice_raw_posts")
            .select("id, source, external_id, " + ", ".join(REQUIRED_COLUMNS))
            .gte("collected_at", since).gt("id", last_id).order("id").limit(_PAGE)
            .execute()
        ).data or []
        rows.extend(page)
        if len(page) < _PAGE:
            break
        last_id = page[-1]["id"]

    m.window_rows = len(rows)
    m.null_counts = {c: sum(1 for r in rows if r.get(c) in (None, "")) for c in REQUIRED_COLUMNS}
    keys = Counter((r["source"], r["external_id"]) for r in rows)
    m.duplicate_keys = sum(n - 1 for n in keys.values() if n > 1)
    limit = now + th.future_tolerance
    m.future_posted_at = sum(
        1 for r in rows
        if r.get("posted_at") and datetime.fromisoformat(r["posted_at"].replace("Z", "+00:00")) > limit
    )

    m.neutral_recent = _neutral_pair(db, now - timedelta(hours=24), now)
    m.neutral_baseline = _neutral_pair(db, now - timedelta(days=8), now - timedelta(hours=24))
    m.backlog = _count(db, lambda q: q.is_("classified_at", "null"))
    return m


def run_checks(run: RunRecord) -> list[Finding]:
    """지표 수집 + 판정. DB 조회가 실패해도 실행 지표 기반 경고는 반환한다."""
    try:
        metrics = collect_metrics()
    except Exception as exc:  # noqa: BLE001 — 품질 체크 실패가 파이프라인을 멈추면 안 됨
        logger.warning("데이터 품질 지표 조회 실패: %s", exc)
        metrics = Metrics()
    findings = evaluate(metrics, run)
    for f in findings:
        logger.warning("데이터 품질 %s", f)
    return findings
