"""분류 결과 감사용 샘플 추출 — sentiment별 50건씩 랜덤 샘플링해 CSV로 저장.

과거 데이터는 폴백 로깅 없이 지나갔으므로 소급 확인이 불가능하다. 대신 현재
분류 결과 자체를 사람이 검수할 샘플을 뽑는다 (측정 가이드 Phase 2).

출력: pipeline/audit_sample_{YYYYMMDD}.csv
  - label_actual 컬럼은 비워서 출력 — 사람이 직접 채운 뒤 eval_classifier.py에 입력.

실행: cd pipeline && uv run python scripts/sample_for_audit.py
"""

from __future__ import annotations

import csv
import json
import logging
import random
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from src.db import get_supabase

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger(__name__)

SENTIMENTS = ["positive", "negative", "neutral"]
SAMPLE_PER_SENTIMENT = 50
_PAGE_SIZE = 1000  # PostgREST 기본 응답 상한 — id 조회 시 페이지네이션

FIELDNAMES = [
    "id", "title", "body", "sentiment", "categories", "issue_summary", "url",
    "classified_by_model",
    "label_actual",  # 사람이 채울 정답 라벨 (positive/negative/neutral)
]


def _fetch_ids(db, sentiment: str) -> list[int]:
    """해당 sentiment로 분류된 게시글 id 전체 조회 (페이지네이션)."""
    ids: list[int] = []
    offset = 0
    while True:
        rows = (
            db.table("voice_raw_posts")
            .select("id")
            .eq("sentiment", sentiment)
            .not_.is_("classified_at", "null")
            .range(offset, offset + _PAGE_SIZE - 1)
            .execute()
        ).data or []
        ids.extend(r["id"] for r in rows)
        if len(rows) < _PAGE_SIZE:
            return ids
        offset += _PAGE_SIZE


def _fetch_rows(db, ids: list[int]) -> list[dict]:
    rows = (
        db.table("voice_raw_posts")
        .select("id, title, body, sentiment, categories, issue_summary, url, classified_by_model")
        .in_("id", ids)
        .execute()
    ).data or []
    return rows


def main() -> None:
    db = get_supabase(use_service_role=True)
    sampled: list[dict] = []

    for sentiment in SENTIMENTS:
        ids = _fetch_ids(db, sentiment)
        take = min(SAMPLE_PER_SENTIMENT, len(ids))
        if take < SAMPLE_PER_SENTIMENT:
            logger.warning("%s: 전체 %d건뿐 — %d건만 샘플링", sentiment, len(ids), take)
        picked = random.sample(ids, take)
        rows = _fetch_rows(db, picked)
        logger.info("%s: %d건 중 %d건 샘플링", sentiment, len(ids), len(rows))
        sampled.extend(rows)

    random.shuffle(sampled)  # 라벨링 시 sentiment 뭉침으로 인한 편향 방지

    ts = datetime.now(tz=timezone.utc).strftime("%Y%m%d")
    out_file = Path(__file__).parent.parent / f"audit_sample_{ts}.csv"
    with out_file.open("w", newline="", encoding="utf-8-sig") as f:  # 엑셀 한글 호환 BOM
        writer = csv.DictWriter(f, fieldnames=FIELDNAMES)
        writer.writeheader()
        for row in sampled:
            cats = row.get("categories")
            writer.writerow({
                "id": row["id"],
                "title": row.get("title") or "",
                "body": row.get("body") or "",
                "sentiment": row.get("sentiment") or "",
                "categories": json.dumps(cats, ensure_ascii=False) if cats else "",
                "issue_summary": row.get("issue_summary") or "",
                "url": row.get("url") or "",
                "classified_by_model": row.get("classified_by_model") or "",
                "label_actual": "",
            })

    logger.info("=== 감사용 샘플 %d건 저장: %s ===", len(sampled), out_file)
    logger.info("다음 단계: label_actual 컬럼을 직접 채운 뒤 eval_classifier.py에 입력")


if __name__ == "__main__":
    main()
