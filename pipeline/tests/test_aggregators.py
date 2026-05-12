"""집계 모듈 단위 테스트 — Supabase mock 사용."""

from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest

from src.aggregators.hourly import _aggregate_posts, refresh_daily_stats, refresh_hourly_stats


# ── 헬퍼 ─────────────────────────────────────────────────────────────────────

def _make_post(
    sentiment: str = "positive",
    categories: list[str] | None = None,
    keywords: list[str] | None = None,
    issue_summary: str | None = None,
    posted_at: str = "2026-05-01T10:30:00+00:00",
) -> dict:
    return {
        "id": 1,
        "sentiment": sentiment,
        "categories": categories or ["클래스밸런스"],
        "keywords": keywords or ["글라디", "패치"],
        "issue_summary": issue_summary,
        "posted_at": posted_at,
        "classified_at": "2026-05-01T10:31:00+00:00",
    }


# ── _aggregate_posts 단위 테스트 ──────────────────────────────────────────────

def test_aggregate_counts_sentiments():
    posts = [
        _make_post("positive"),
        _make_post("positive"),
        _make_post("negative"),
        _make_post("neutral"),
    ]
    result = _aggregate_posts(posts)
    assert result["total_count"] == 4
    assert result["positive_count"] == 2
    assert result["negative_count"] == 1
    assert result["neutral_count"] == 1


def test_aggregate_categories_jsonb():
    """여러 게시글의 categories가 카운트별 dict으로 집계됨."""
    posts = [
        _make_post(categories=["클래스밸런스", "버그오류"]),
        _make_post(categories=["클래스밸런스"]),
        _make_post(categories=["이벤트과금"]),
    ]
    result = _aggregate_posts(posts)
    assert result["categories"]["클래스밸런스"] == 2
    assert result["categories"]["버그오류"] == 1
    assert result["categories"]["이벤트과금"] == 1


def test_aggregate_top_keywords_sorted():
    """키워드 빈도 내림차순 정렬 + 최대 10개."""
    posts = [
        _make_post(keywords=["글라디", "버프", "패치"]),
        _make_post(keywords=["글라디", "버프"]),
        _make_post(keywords=["글라디"]),
    ]
    result = _aggregate_posts(posts)
    keywords = result["top_keywords"]
    assert keywords[0]["keyword"] == "글라디"
    assert keywords[0]["count"] == 3
    assert keywords[1]["count"] == 2


def test_aggregate_top_keywords_capped_at_10():
    """키워드 최대 10개 제한."""
    kws = [f"kw{i}" for i in range(15)]
    posts = [_make_post(keywords=kws)]
    result = _aggregate_posts(posts)
    assert len(result["top_keywords"]) == 10


def test_aggregate_empty_posts():
    result = _aggregate_posts([])
    assert result["total_count"] == 0
    assert result["positive_count"] == 0
    assert result["categories"] == {}
    assert result["top_keywords"] == []


# ── refresh_hourly_stats 통합 테스트 ─────────────────────────────────────────

@patch("src.aggregators.hourly.get_supabase")
def test_hourly_upserts_buckets(mock_get_supabase):
    """2개 시간대 데이터 → 2행 UPSERT."""
    posts = [
        _make_post(posted_at="2026-05-01T10:10:00+00:00"),
        _make_post(posted_at="2026-05-01T10:55:00+00:00"),
        _make_post(posted_at="2026-05-01T11:05:00+00:00"),
    ]

    mock_db = MagicMock()
    mock_get_supabase.return_value = mock_db
    mock_db.table.return_value.select.return_value.not_.is_.return_value\
        .gte.return_value.execute.return_value.data = posts
    mock_db.table.return_value.upsert.return_value.execute.return_value = MagicMock()

    result = refresh_hourly_stats(hours_back=3)

    assert result == 2
    upsert_call = mock_db.table.return_value.upsert.call_args
    rows = upsert_call[0][0]
    hours = {r["hour"] for r in rows}
    assert len(hours) == 2


@patch("src.aggregators.hourly.get_supabase")
def test_hourly_returns_zero_on_empty(mock_get_supabase):
    mock_db = MagicMock()
    mock_get_supabase.return_value = mock_db
    mock_db.table.return_value.select.return_value.not_.is_.return_value\
        .gte.return_value.execute.return_value.data = []

    result = refresh_hourly_stats(hours_back=3)
    assert result == 0
    mock_db.table.return_value.upsert.assert_not_called()


@patch("src.aggregators.hourly.get_supabase")
def test_hourly_returns_zero_on_db_error(mock_get_supabase):
    mock_db = MagicMock()
    mock_get_supabase.return_value = mock_db
    mock_db.table.return_value.select.return_value.not_.is_.return_value\
        .gte.return_value.execute.side_effect = Exception("DB 오류")

    result = refresh_hourly_stats(hours_back=3)
    assert result == 0


# ── refresh_daily_stats 통합 테스트 ──────────────────────────────────────────

@patch("src.aggregators.hourly.get_supabase")
def test_daily_includes_top_issues(mock_get_supabase):
    """issue_summary가 있는 게시글 → top_issues 집계."""
    posts = [
        _make_post(issue_summary="글라디 상향 요청.", posted_at="2026-05-01T10:00:00+00:00"),
        _make_post(issue_summary="글라디 상향 요청.", posted_at="2026-05-01T11:00:00+00:00"),
        _make_post(issue_summary="버그 패치 요청.", posted_at="2026-05-01T12:00:00+00:00"),
    ]

    mock_db = MagicMock()
    mock_get_supabase.return_value = mock_db
    mock_db.table.return_value.select.return_value.not_.is_.return_value\
        .gte.return_value.execute.return_value.data = posts
    mock_db.table.return_value.upsert.return_value.execute.return_value = MagicMock()

    result = refresh_daily_stats(days_back=7)

    assert result == 1
    upsert_call = mock_db.table.return_value.upsert.call_args
    row = upsert_call[0][0][0]
    assert row["top_issues"][0]["summary"] == "글라디 상향 요청."
    assert row["top_issues"][0]["count"] == 2


@patch("src.aggregators.hourly.get_supabase")
def test_daily_returns_zero_on_empty(mock_get_supabase):
    mock_db = MagicMock()
    mock_get_supabase.return_value = mock_db
    mock_db.table.return_value.select.return_value.not_.is_.return_value\
        .gte.return_value.execute.return_value.data = []

    result = refresh_daily_stats(days_back=7)
    assert result == 0
