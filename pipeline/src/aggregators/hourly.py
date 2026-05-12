"""시간별·일별 집계 갱신.

voice_raw_posts (classified_at IS NOT NULL) 에서 집계하여
voice_hourly_stats / voice_daily_stats 에 UPSERT.

증분 전략: 최근 N시간/N일만 재계산 — 전체 재계산보다 효율적.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from ..db import get_supabase

logger = logging.getLogger(__name__)

# Supabase RPC 대신 Python에서 집계 후 UPSERT
# (RPC 함수 없이도 동작하도록 클라이언트 사이드 집계)


def _aggregate_posts(posts: list[dict]) -> dict:
    """게시글 목록에서 집계 지표 계산."""
    total = len(posts)
    sentiment_counts: dict[str, int] = {"positive": 0, "negative": 0, "neutral": 0}
    category_counts: dict[str, int] = {}
    keyword_counts: dict[str, int] = {}

    for post in posts:
        sentiment = post.get("sentiment") or ""
        if sentiment in sentiment_counts:
            sentiment_counts[sentiment] += 1

        for cat in (post.get("categories") or []):
            category_counts[cat] = category_counts.get(cat, 0) + 1

        for kw in (post.get("keywords") or []):
            keyword_counts[kw] = keyword_counts.get(kw, 0) + 1

    top_keywords = sorted(keyword_counts.items(), key=lambda x: x[1], reverse=True)[:10]

    return {
        "total_count": total,
        "positive_count": sentiment_counts["positive"],
        "negative_count": sentiment_counts["negative"],
        "neutral_count": sentiment_counts["neutral"],
        "categories": category_counts,
        "top_keywords": [{"keyword": k, "count": v} for k, v in top_keywords],
    }


def refresh_hourly_stats(hours_back: int = 3) -> int:
    """최근 N시간 시간대별 집계를 재계산해서 voice_hourly_stats에 UPSERT.

    Returns:
        UPSERT된 시간대 수
    """
    db = get_supabase(use_service_role=True)
    now = datetime.now(tz=timezone.utc)
    since = now - timedelta(hours=hours_back)

    try:
        rows = (
            db.table("voice_raw_posts")
            .select("id, sentiment, categories, keywords, posted_at")
            .not_.is_("classified_at", "null")
            .gte("posted_at", since.isoformat())
            .execute()
        ).data or []
    except Exception as exc:
        logger.error("hourly 집계 조회 실패: %s", exc)
        return 0

    # 시간대별 그룹핑
    buckets: dict[str, list[dict]] = {}
    for row in rows:
        posted_at = row.get("posted_at", "")
        if not posted_at:
            continue
        # ISO 문자열에서 시간 버킷 추출 (분/초 제거)
        try:
            dt = datetime.fromisoformat(posted_at.replace("Z", "+00:00"))
            bucket_key = dt.replace(minute=0, second=0, microsecond=0).isoformat()
        except ValueError:
            continue
        buckets.setdefault(bucket_key, []).append(row)

    if not buckets:
        logger.info("hourly 집계: 대상 데이터 없음 (hours_back=%d)", hours_back)
        return 0

    upsert_rows = []
    for hour_str, posts in buckets.items():
        stats = _aggregate_posts(posts)
        upsert_rows.append({
            "hour": hour_str,
            "updated_at": now.isoformat(),
            **stats,
        })

    try:
        db.table("voice_hourly_stats").upsert(
            upsert_rows, on_conflict="hour"
        ).execute()
        logger.info("hourly 집계 UPSERT: %d개 시간대", len(upsert_rows))
        return len(upsert_rows)
    except Exception as exc:
        logger.error("hourly 집계 UPSERT 실패: %s", exc)
        return 0


def refresh_daily_stats(days_back: int = 7) -> int:
    """최근 N일 일별 집계를 재계산해서 voice_daily_stats에 UPSERT.

    Returns:
        UPSERT된 일자 수
    """
    db = get_supabase(use_service_role=True)
    now = datetime.now(tz=timezone.utc)
    since = now - timedelta(days=days_back)

    try:
        rows = (
            db.table("voice_raw_posts")
            .select("id, sentiment, categories, keywords, issue_summary, posted_at")
            .not_.is_("classified_at", "null")
            .gte("posted_at", since.isoformat())
            .execute()
        ).data or []
    except Exception as exc:
        logger.error("daily 집계 조회 실패: %s", exc)
        return 0

    # 일별 그룹핑
    buckets: dict[str, list[dict]] = {}
    for row in rows:
        posted_at = row.get("posted_at", "")
        if not posted_at:
            continue
        try:
            dt = datetime.fromisoformat(posted_at.replace("Z", "+00:00"))
            day_key = dt.date().isoformat()
        except ValueError:
            continue
        buckets.setdefault(day_key, []).append(row)

    if not buckets:
        logger.info("daily 집계: 대상 데이터 없음 (days_back=%d)", days_back)
        return 0

    upsert_rows = []
    for day_str, posts in buckets.items():
        stats = _aggregate_posts(posts)

        # top_issues: issue_summary 빈도 TOP 5
        issue_counts: dict[str, int] = {}
        for post in posts:
            summary = (post.get("issue_summary") or "").strip()
            if summary:
                issue_counts[summary] = issue_counts.get(summary, 0) + 1
        top_issues = sorted(issue_counts.items(), key=lambda x: x[1], reverse=True)[:5]

        upsert_rows.append({
            "day": day_str,
            "updated_at": now.isoformat(),
            "top_issues": [{"summary": s, "count": c} for s, c in top_issues],
            **stats,
        })

    try:
        db.table("voice_daily_stats").upsert(
            upsert_rows, on_conflict="day"
        ).execute()
        logger.info("daily 집계 UPSERT: %d개 일자", len(upsert_rows))
        return len(upsert_rows)
    except Exception as exc:
        logger.error("daily 집계 UPSERT 실패: %s", exc)
        return 0
