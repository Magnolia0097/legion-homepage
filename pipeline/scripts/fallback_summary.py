"""폴백 발생 요약 리포트 — classification_fallback_log 기반 (측정 가이드 Phase 4).

Phase 1 배포 후 쌓인 실제 데이터로 다음을 계산한다:
1. 전체 분류 건수 대비 폴백 비율 (%)
2. 모델별 폴백 비율 (해당 모델이 분류한 건수 대비)
3. 카테고리 필터링 발생 비율

실행: cd pipeline && uv run python scripts/fallback_summary.py [일수]
      (기본 7일 — 최근 N일간의 classified_at / created_at 기준)
"""

from __future__ import annotations

import logging
import sys
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from src.db import get_supabase

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger(__name__)

_PAGE_SIZE = 1000  # PostgREST 기본 응답 상한 — 페이지네이션


def _fetch_all(query_builder_fn) -> list[dict]:
    """페이지네이션으로 전체 행 조회. query_builder_fn(offset, limit) → 실행된 응답 data."""
    rows: list[dict] = []
    offset = 0
    while True:
        page = query_builder_fn(offset, _PAGE_SIZE) or []
        rows.extend(page)
        if len(page) < _PAGE_SIZE:
            return rows
        offset += _PAGE_SIZE


def fetch_classified(db, cutoff_iso: str) -> list[dict]:
    """기간 내 분류 완료된 게시글 (스팸 제외) — 모델별 분모 계산용."""
    def page(offset: int, limit: int):
        return (
            db.table("voice_raw_posts")
            .select("id, classified_by_model")
            .gte("classified_at", cutoff_iso)
            .neq("sentiment", "spam")
            .range(offset, offset + limit - 1)
            .execute()
        ).data
    return _fetch_all(page)


def fetch_fallbacks(db, cutoff_iso: str) -> list[dict]:
    def page(offset: int, limit: int):
        return (
            db.table("classification_fallback_log")
            .select("id, fallback_type, model, created_at")
            .gte("created_at", cutoff_iso)
            .range(offset, offset + limit - 1)
            .execute()
        ).data
    return _fetch_all(page)


def _pct(n: int, total: int) -> str:
    return f"{n / total * 100:.2f}%" if total else "n/a"


def main() -> None:
    days = int(sys.argv[1]) if len(sys.argv) > 1 else 7
    cutoff = datetime.now(tz=timezone.utc) - timedelta(days=days)
    cutoff_iso = cutoff.isoformat()

    db = get_supabase(use_service_role=True)
    classified = fetch_classified(db, cutoff_iso)
    fallbacks = fetch_fallbacks(db, cutoff_iso)

    total = len(classified)
    invalid_sentiment = [f for f in fallbacks if f["fallback_type"] == "invalid_sentiment"]
    category_filtered = [f for f in fallbacks if f["fallback_type"] == "category_filtered"]

    print(f"\n=== 폴백 요약 리포트 (최근 {days}일, {cutoff_iso[:10]} 이후) ===")
    print(f"\n전체 분류 건수 (스팸 제외): {total}건")
    if not total:
        print("기간 내 분류된 게시글이 없습니다 — 파이프라인 가동 여부를 확인하세요.")
        return

    print("\n── 1. 전체 대비 폴백 비율 " + "─" * 34)
    print(f"  invalid_sentiment (neutral 폴백): {len(invalid_sentiment):>5}건  "
          f"({_pct(len(invalid_sentiment), total)})")
    print(f"  category_filtered (카테고리 제거): {len(category_filtered):>5}건  "
          f"({_pct(len(category_filtered), total)})")

    # ── 2. 모델별 폴백 비율 ──────────────────────────────────────────────────
    # 분모: 해당 모델이 분류한 건수 (voice_raw_posts.classified_by_model)
    # 분자: 해당 모델에서 발생한 invalid_sentiment 폴백 건수
    classified_by_model = Counter(
        (r.get("classified_by_model") or "(기록없음)") for r in classified
    )
    fallback_by_model = Counter((f.get("model") or "(기록없음)") for f in invalid_sentiment)
    catfilter_by_model = Counter((f.get("model") or "(기록없음)") for f in category_filtered)

    print("\n── 2. 모델별 breakdown " + "─" * 38)
    print(f"{'model':>30} {'분류건수':>8} {'폴백':>6} {'폴백율':>8} {'카테고리필터':>10}")
    all_models = sorted(
        set(classified_by_model) | set(fallback_by_model) | set(catfilter_by_model),
        key=lambda m: -classified_by_model.get(m, 0),
    )
    for model in all_models:
        n_cls = classified_by_model.get(model, 0)
        n_fb = fallback_by_model.get(model, 0)
        n_cat = catfilter_by_model.get(model, 0)
        print(f"{model:>30} {n_cls:>8} {n_fb:>6} {_pct(n_fb, n_cls):>8} {n_cat:>10}")
    print("  * (기록없음) = 002 마이그레이션 이전 분류분 또는 로그 누락")

    # ── 3. 참고: Gemini 경로 대비 비율 ───────────────────────────────────────
    # 폴백은 Gemini 경로에서만 발생 — 무료 경로(local-keyword 등)를 분모에서 빼면
    # LLM 응답 품질 문제의 실제 크기가 보인다.
    _FREE_PATH_MODELS = {"local-keyword", "question-filter", "question-filter-v2"}
    gemini_total = sum(
        n for m, n in classified_by_model.items()
        if m not in _FREE_PATH_MODELS and not m.startswith("transformer:")
    )
    print("\n── 3. Gemini 경로 한정 비율 " + "─" * 33)
    print(f"  Gemini 경로 분류 건수: {gemini_total}건")
    print(f"  invalid_sentiment 비율: {_pct(len(invalid_sentiment), gemini_total)}")
    print(f"  category_filtered 비율: {_pct(len(category_filtered), gemini_total)}")


if __name__ == "__main__":
    main()
