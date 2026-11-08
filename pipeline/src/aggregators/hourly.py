"""시간별·일별 집계 갱신.

voice_raw_posts(분류 완료, 스팸 제외)를 집계해 voice_hourly_stats / voice_daily_stats에 UPSERT.

2026-11 수정 (일별 통계가 실제의 몇 % 수준으로 쪼그라들던 문제)
- 재계산 구간을 시간·일 경계에 맞춘다. 예전엔 'now - N시간/일'부터만 다시 세서, 구간의 가장
  오래된 날(시간)은 중간부터 잘린 숫자로 매 실행 덮어써졌다. 결국 그날 마지막 몇 시간치만 남았다
  (예: 9/16 통계 17건 vs 실제 473건, 9/9는 1건 vs 373건).
- 일 단위는 KST 자정 기준. 예전엔 UTC 날짜로 묶여 하루가 오전 9시에 바뀌었다.
- PostgREST 기본 max_rows(1000) 때문에 바쁜 날은 일부만 집계됐다 → 1000행씩 페이지 조회.
- 스팸(sentiment='spam')은 집계에서 뺀다 (총 글 수에 광고가 섞이지 않게).
- 이번 실행에서 분류된 글이 속한 시간대·날짜를 추가로 넘겨 받아 재계산한다
  (밀린 글을 나중에 분류해도 해당 날짜 통계가 갱신되도록).
- 재계산 대상인데 글이 0건이 된 시간대·날짜는 행을 지운다 (낡은 숫자가 남지 않게).
"""

from __future__ import annotations

import logging
from collections.abc import Iterable
from datetime import date, datetime, timedelta, timezone

from ..db import get_supabase

logger = logging.getLogger(__name__)

KST = timezone(timedelta(hours=9))
_PAGE = 1000  # PostgREST 기본 max_rows


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


def _top_issues(posts: list[dict], limit: int = 5) -> list[dict]:
    """issue_summary(LLM이 붙인 이슈 topic) 빈도 TOP N."""
    issue_counts: dict[str, int] = {}
    for post in posts:
        summary = (post.get("issue_summary") or "").strip()
        if summary:
            issue_counts[summary] = issue_counts.get(summary, 0) + 1
    top = sorted(issue_counts.items(), key=lambda x: x[1], reverse=True)[:limit]
    return [{"summary": s, "count": c} for s, c in top]


def _parse_ts(value: str) -> datetime | None:
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (AttributeError, ValueError):
        return None


def _fetch_classified(columns: str, start: datetime, end: datetime) -> list[dict]:
    """posted_at이 [start, end)인 분류 완료·비스팸 글 전부 (1000행씩 페이지 조회)."""
    db = get_supabase(use_service_role=True)
    rows: list[dict] = []
    offset = 0
    while True:
        page = (
            db.table("voice_raw_posts")
            .select(columns)
            .not_.is_("classified_at", "null")
            .neq("sentiment", "spam")
            .gte("posted_at", start.isoformat())
            .lt("posted_at", end.isoformat())
            .order("id")
            .range(offset, offset + _PAGE - 1)
            .execute()
        ).data or []
        rows.extend(page)
        if len(page) < _PAGE:
            return rows
        offset += _PAGE


def _ranges(keys: list, step: timedelta) -> list[tuple]:
    """정렬된 버킷 시작 시각들을 연속 구간 [(start, end), ...]으로 묶는다 (조회 횟수 절약)."""
    out: list[list] = []
    for k in keys:
        if out and out[-1][1] == k:
            out[-1][1] = k + step
        else:
            out.append([k, k + step])
    return [(s, e) for s, e in out]


def _delete_empty(table: str, key_col: str, keys: list[str]) -> None:
    if not keys:
        return
    db = get_supabase(use_service_role=True)
    try:
        db.table(table).delete().in_(key_col, keys).execute()
    except Exception as exc:
        logger.warning("%s 빈 버킷 정리 실패: %s", table, exc)


# ── 시간별 ────────────────────────────────────────────────────────────────────

def _floor_hour(dt: datetime) -> datetime:
    return dt.astimezone(timezone.utc).replace(minute=0, second=0, microsecond=0)


def refresh_hourly_stats(hours_back: int = 24, hours: Iterable[datetime] | None = None) -> int:
    """시간대별 집계를 재계산해서 voice_hourly_stats에 UPSERT.

    Args:
        hours_back: 현재 시간대를 포함해 최근 몇 시간을 재계산할지
        hours: 추가로 재계산할 시각들 (이번 실행에서 분류된 글의 posted_at 등). 시간 단위로 내림.

    Returns:
        UPSERT된 시간대 수
    """
    now = datetime.now(tz=timezone.utc)
    current = _floor_hour(now)
    buckets = {current - timedelta(hours=h) for h in range(max(hours_back, 1))}
    buckets |= {_floor_hour(h) for h in (hours or []) if h is not None and h <= now}
    keys = sorted(buckets)

    grouped: dict[datetime, list[dict]] = {}
    try:
        for start, end in _ranges(keys, timedelta(hours=1)):
            for row in _fetch_classified("id, sentiment, categories, keywords, posted_at", start, end):
                ts = _parse_ts(row.get("posted_at", ""))
                if ts is not None:
                    grouped.setdefault(_floor_hour(ts), []).append(row)
    except Exception as exc:
        logger.error("hourly 집계 조회 실패: %s", exc)
        return 0

    upsert_rows = [
        {"hour": hour.isoformat(), "updated_at": now.isoformat(), **_aggregate_posts(posts)}
        for hour, posts in sorted(grouped.items())
    ]
    empty = [k.isoformat() for k in keys if k not in grouped]

    if upsert_rows:
        db = get_supabase(use_service_role=True)
        try:
            db.table("voice_hourly_stats").upsert(upsert_rows, on_conflict="hour").execute()
        except Exception as exc:
            logger.error("hourly 집계 UPSERT 실패: %s", exc)
            return 0
    _delete_empty("voice_hourly_stats", "hour", empty)
    logger.info("hourly 집계: %d개 시간대 UPSERT, 빈 시간대 %d개 정리", len(upsert_rows), len(empty))
    return len(upsert_rows)


# ── 일별 (KST) ────────────────────────────────────────────────────────────────

def _kst_day(dt: datetime) -> date:
    return dt.astimezone(KST).date()


def _kst_midnight(d: date) -> datetime:
    return datetime(d.year, d.month, d.day, tzinfo=KST)


def refresh_daily_stats(days_back: int = 2, days: Iterable[date | datetime] | None = None) -> int:
    """KST 날짜별 집계를 재계산해서 voice_daily_stats에 UPSERT.

    Args:
        days_back: 오늘(KST)을 포함해 최근 며칠을 재계산할지
        days: 추가로 재계산할 날짜(또는 시각 — KST 날짜로 변환)

    Returns:
        UPSERT된 일자 수
    """
    now = datetime.now(tz=timezone.utc)
    today = _kst_day(now)
    targets = {today - timedelta(days=d) for d in range(max(days_back, 1))}
    for d in days or []:
        if isinstance(d, datetime):
            d = _kst_day(d)
        if d is not None and d <= today:
            targets.add(d)
    keys = sorted(targets)

    grouped: dict[date, list[dict]] = {}
    try:
        for start, end in _ranges(keys, timedelta(days=1)):
            rows = _fetch_classified(
                "id, sentiment, categories, keywords, issue_summary, posted_at",
                _kst_midnight(start), _kst_midnight(end),
            )
            for row in rows:
                ts = _parse_ts(row.get("posted_at", ""))
                if ts is not None:
                    grouped.setdefault(_kst_day(ts), []).append(row)
    except Exception as exc:
        logger.error("daily 집계 조회 실패: %s", exc)
        return 0

    upsert_rows = [
        {
            "day": day.isoformat(),
            "updated_at": now.isoformat(),
            "top_issues": _top_issues(posts),
            **_aggregate_posts(posts),
        }
        for day, posts in sorted(grouped.items())
    ]
    empty = [k.isoformat() for k in keys if k not in grouped]

    if upsert_rows:
        db = get_supabase(use_service_role=True)
        try:
            db.table("voice_daily_stats").upsert(upsert_rows, on_conflict="day").execute()
        except Exception as exc:
            logger.error("daily 집계 UPSERT 실패: %s", exc)
            return 0
    _delete_empty("voice_daily_stats", "day", empty)
    logger.info("daily 집계: %d개 일자 UPSERT, 빈 일자 %d개 정리", len(upsert_rows), len(empty))
    return len(upsert_rows)
