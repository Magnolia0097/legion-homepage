"""파이프라인 메인 진입점.

실행 순서:
1. 수집  — collect_inven_aion2 → save_posts
2. 필터  — is_spam → mark_as_spam (sentiment='spam')
3. 분류  — classify_post → update_classification (Gemini Flash)
4. 집계  — refresh_hourly_stats / refresh_daily_stats

cron으로 30분마다 실행:
    */30 * * * * cd /path/to/legion-homepage/pipeline && uv run python scripts/run_pipeline.py >> logs/pipeline.log 2>&1
"""

from __future__ import annotations

import logging
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

# scripts/ 디렉토리에서 실행할 때 src 패키지를 찾기 위해 파이프라인 루트를 sys.path에 추가
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.aggregators.hourly import refresh_daily_stats, refresh_hourly_stats
from src.collectors.inven import collect_inven_aion2, save_posts
from src.config import get_settings
from src.db import fetch_unclassified, mark_as_spam
from src.processors.classifier import classify_post, update_classification
from src.processors.filter import is_spam

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

_CLASSIFY_SLEEP = 4.0  # Gemini Flash 무료 15 RPM → 4초 간격 유지
_KST = timezone(timedelta(hours=9))


def _is_today_kst(iso_str: str) -> bool:
    """게시글 posted_at이 오늘(KST) 날짜인지 확인."""
    try:
        dt = datetime.fromisoformat(iso_str)
        return dt.astimezone(_KST).date() == datetime.now(tz=_KST).date()
    except (ValueError, TypeError):
        return True


def main() -> None:
    logger.info("=== 파이프라인 시작 ===")

    # ── 1. 수집 (설정된 모든 게시판) ─────────────────────────────────────────
    settings = get_settings()
    collected: list[dict] = []
    saved = 0
    # 자유게시판(6388)은 활동량이 많아 2페이지, 직업게시판은 1페이지
    _FREE_BOARD = 6388
    for board_id in settings.board_id_list:
        max_pages = 2 if board_id == _FREE_BOARD else 1
        try:
            posts = collect_inven_aion2(board_id=board_id, max_pages=max_pages)
            posts_today = [p for p in posts if _is_today_kst(p["posted_at"])]
            skipped = len(posts) - len(posts_today)
            if skipped:
                logger.info("오늘 날짜 필터: %d건 제외 (board_id=%d)", skipped, board_id)
            saved += save_posts(posts_today)
            collected.extend(posts_today)
        except Exception as exc:
            logger.error("board_id=%d 수집 실패: %s", board_id, exc)
    logger.info("수집/저장: %d건 수집, %d건 신규 저장", len(collected), saved)

    # ── 2. 미분류 게시글 가져오기 ─────────────────────────────────────────────
    unclassified = fetch_unclassified(limit=30)
    logger.info("미분류 게시글: %d건", len(unclassified))

    spam_count = 0
    classified_count = 0
    failed_count = 0

    for post in unclassified:
        post_id = post["id"]

        # ── 3. 필터 (Tier-1) ─────────────────────────────────────────────────
        if is_spam(post):
            mark_as_spam(post_id)
            spam_count += 1
            continue

        # ── 4. 분류 (Tier-2 Gemini) ───────────────────────────────────────────
        result = classify_post(post)
        if result is None:
            failed_count += 1
            continue

        update_classification(post_id, result)
        classified_count += 1
        time.sleep(_CLASSIFY_SLEEP)

    logger.info(
        "처리 완료 — 스팸: %d건, 분류 성공: %d건, 분류 실패: %d건",
        spam_count, classified_count, failed_count,
    )
    # ── 5. 집계 갱신 ─────────────────────────────────────────────────────────
    try:
        hourly = refresh_hourly_stats(hours_back=24)
        daily = refresh_daily_stats(days_back=2)
        logger.info("집계: hourly %d개 시간대, daily %d개 일자", hourly, daily)
    except Exception as exc:
        logger.error("집계 단계 실패: %s", exc)
        hourly = daily = 0

    logger.info(
        "=== 파이프라인 종료 (수집 %d건 / 스팸 %d / 분류 %d / 실패 %d / 집계 hourly %d daily %d) ===",
        saved, spam_count, classified_count, failed_count, hourly, daily,
    )


if __name__ == "__main__":
    main()
