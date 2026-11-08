"""집계 모듈 단위 테스트 — Supabase mock 사용."""

from datetime import date, datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

from src.aggregators import hourly
from src.aggregators.hourly import (
    KST,
    _aggregate_posts,
    _fetch_classified,
    _ranges,
    refresh_daily_stats,
    refresh_hourly_stats,
)

UTC = timezone.utc


# ── 헬퍼 ─────────────────────────────────────────────────────────────────────

def _make_post(
    sentiment: str = "positive",
    categories: list[str] | None = None,
    keywords: list[str] | None = None,
    issue_summary: str | None = None,
    posted_at: str = "2026-05-01T10:30:00+00:00",
    post_id: int = 1,
) -> dict:
    return {
        "id": post_id,
        "sentiment": sentiment,
        "categories": categories or ["클래스밸런스"],
        "keywords": keywords or ["글라디", "패치"],
        "issue_summary": issue_summary,
        "posted_at": posted_at,
        "classified_at": "2026-05-01T10:31:00+00:00",
    }


def _fake_fetch(posts: list[dict]):
    """_fetch_classified 대역 — 요청 구간 [start, end)에 드는 글만 돌려준다 (실제 DB처럼)."""
    calls: list[tuple[datetime, datetime]] = []

    def fetch(columns, start, end):
        calls.append((start, end))
        return [p for p in posts if start <= datetime.fromisoformat(p["posted_at"]) < end]

    fetch.calls = calls
    return fetch


def _db_mock() -> MagicMock:
    db = MagicMock()
    db.table.return_value.upsert.return_value.execute.return_value = MagicMock()
    return db


# ── _aggregate_posts ──────────────────────────────────────────────────────────

def test_aggregate_counts_sentiments():
    posts = [_make_post("positive"), _make_post("positive"), _make_post("negative"), _make_post("neutral")]
    result = _aggregate_posts(posts)
    assert result["total_count"] == 4
    assert result["positive_count"] == 2
    assert result["negative_count"] == 1
    assert result["neutral_count"] == 1


def test_aggregate_categories_jsonb():
    posts = [
        _make_post(categories=["클래스밸런스", "버그오류"]),
        _make_post(categories=["클래스밸런스"]),
        _make_post(categories=["이벤트과금"]),
    ]
    result = _aggregate_posts(posts)
    assert result["categories"] == {"클래스밸런스": 2, "버그오류": 1, "이벤트과금": 1}


def test_aggregate_top_keywords_sorted_and_capped():
    posts = [
        _make_post(keywords=["글라디", "버프", "패치"]),
        _make_post(keywords=["글라디", "버프"]),
        _make_post(keywords=["글라디"]),
    ]
    keywords = _aggregate_posts(posts)["top_keywords"]
    assert keywords[0] == {"keyword": "글라디", "count": 3}
    assert keywords[1]["count"] == 2
    assert len(_aggregate_posts([_make_post(keywords=[f"kw{i}" for i in range(15)])])["top_keywords"]) == 10


def test_aggregate_empty_posts():
    result = _aggregate_posts([])
    assert result["total_count"] == 0
    assert result["categories"] == {}
    assert result["top_keywords"] == []


def test_ranges_merges_contiguous_buckets():
    h = timedelta(hours=1)
    t0 = datetime(2026, 5, 1, 0, tzinfo=UTC)
    assert _ranges([t0, t0 + h, t0 + 2 * h, t0 + 5 * h], h) == [(t0, t0 + 3 * h), (t0 + 5 * h, t0 + 6 * h)]


# ── _fetch_classified: 1000행 상한 대응 ───────────────────────────────────────

@patch("src.aggregators.hourly.get_supabase")
def test_fetch_classified_paginates_past_max_rows(mock_get_supabase):
    """PostgREST가 한 번에 1000행만 주므로 다 받을 때까지 range()로 이어서 조회."""
    db = MagicMock()
    mock_get_supabase.return_value = db
    query = db.table.return_value.select.return_value.not_.is_.return_value.neq.return_value \
        .gte.return_value.lt.return_value.order.return_value
    query.range.return_value.execute.side_effect = [
        MagicMock(data=[{"id": i} for i in range(1000)]),
        MagicMock(data=[{"id": i} for i in range(1000, 1005)]),
    ]

    rows = _fetch_classified("id", datetime(2026, 5, 1, tzinfo=UTC), datetime(2026, 5, 2, tzinfo=UTC))

    assert len(rows) == 1005
    assert [c.args for c in query.range.call_args_list] == [(0, 999), (1000, 1999)]
    # 페이지마다 스팸 제외 조건이 붙는다
    neq = db.table.return_value.select.return_value.not_.is_.return_value.neq
    assert [c.args for c in neq.call_args_list] == [("sentiment", "spam")] * 2


# ── refresh_hourly_stats ──────────────────────────────────────────────────────

@patch("src.aggregators.hourly.get_supabase")
def test_hourly_buckets_are_full_hours(mock_get_supabase):
    """같은 시간대 글은 한 행으로, 조회 구간은 정시 경계에서 시작한다."""
    now = datetime.now(tz=UTC)
    base = now.replace(minute=0, second=0, microsecond=0) - timedelta(hours=2)
    posts = [
        _make_post(posted_at=(base + timedelta(minutes=10)).isoformat(), post_id=1),
        _make_post(posted_at=(base + timedelta(minutes=55)).isoformat(), post_id=2),
        _make_post(posted_at=(base + timedelta(hours=1, minutes=5)).isoformat(), post_id=3),
    ]
    db = _db_mock()
    mock_get_supabase.return_value = db
    fake = _fake_fetch(posts)
    with patch.object(hourly, "_fetch_classified", side_effect=fake):
        result = refresh_hourly_stats(hours_back=24)

    assert result == 2
    rows = db.table.return_value.upsert.call_args.args[0]
    assert {r["hour"]: r["total_count"] for r in rows} == {
        base.isoformat(): 2, (base + timedelta(hours=1)).isoformat(): 1,
    }
    assert all(start.minute == 0 and start.second == 0 for start, _ in fake.calls)


@patch("src.aggregators.hourly.get_supabase")
def test_hourly_includes_touched_hours_outside_window(mock_get_supabase):
    """밀린 글을 나중에 분류하면 그 글의 시간대도 재계산한다."""
    old = datetime(2026, 9, 3, 5, 20, tzinfo=UTC)
    posts = [_make_post(posted_at=old.isoformat())]
    db = _db_mock()
    mock_get_supabase.return_value = db
    with patch.object(hourly, "_fetch_classified", side_effect=_fake_fetch(posts)):
        result = refresh_hourly_stats(hours_back=3, hours=[old])

    assert result == 1
    rows = db.table.return_value.upsert.call_args.args[0]
    assert rows[0]["hour"] == datetime(2026, 9, 3, 5, tzinfo=UTC).isoformat()


@patch("src.aggregators.hourly.get_supabase")
def test_hourly_empty_window_deletes_stale_rows(mock_get_supabase):
    db = _db_mock()
    mock_get_supabase.return_value = db
    with patch.object(hourly, "_fetch_classified", return_value=[]):
        result = refresh_hourly_stats(hours_back=3)
    assert result == 0
    db.table.return_value.upsert.assert_not_called()
    db.table.return_value.delete.return_value.in_.assert_called_once()
    assert len(db.table.return_value.delete.return_value.in_.call_args.args[1]) == 3


@patch("src.aggregators.hourly.get_supabase")
def test_hourly_returns_zero_on_db_error(mock_get_supabase):
    mock_get_supabase.return_value = _db_mock()
    with patch.object(hourly, "_fetch_classified", side_effect=Exception("DB 오류")):
        assert refresh_hourly_stats(hours_back=3) == 0


# ── refresh_daily_stats ───────────────────────────────────────────────────────

@patch("src.aggregators.hourly.get_supabase")
def test_daily_groups_by_kst_date(mock_get_supabase):
    """UTC 14:30(=KST 23:30)과 UTC 15:30(=KST 다음날 00:30)은 다른 날로 집계된다."""
    posts = [
        _make_post(posted_at="2026-05-01T14:30:00+00:00", post_id=1),  # KST 5/1 23:30
        _make_post(posted_at="2026-05-01T15:30:00+00:00", post_id=2),  # KST 5/2 00:30
        _make_post(posted_at="2026-05-01T16:00:00+00:00", post_id=3),  # KST 5/2 01:00
    ]
    db = _db_mock()
    mock_get_supabase.return_value = db
    fake = _fake_fetch(posts)
    with patch.object(hourly, "_fetch_classified", side_effect=fake):
        result = refresh_daily_stats(days_back=1, days=[date(2026, 5, 1), date(2026, 5, 2)])

    assert result == 2
    rows = db.table.return_value.upsert.call_args.args[0]
    assert {r["day"]: r["total_count"] for r in rows} == {"2026-05-01": 1, "2026-05-02": 2}
    # 조회 구간은 KST 자정부터
    first_start = min(start for start, _ in fake.calls)
    assert first_start == datetime(2026, 5, 1, tzinfo=KST)


@patch("src.aggregators.hourly.get_supabase")
def test_daily_recomputes_whole_day_not_partial(mock_get_supabase):
    """예전 버그 재현 방지: 'now-48h' 같은 중간 시각이 아니라 하루 전체를 센다."""
    day_posts = [
        _make_post(posted_at=datetime(2026, 9, 16, h, tzinfo=KST).isoformat(), post_id=h)
        for h in range(24)
    ]
    db = _db_mock()
    mock_get_supabase.return_value = db
    with patch.object(hourly, "_fetch_classified", side_effect=_fake_fetch(day_posts)):
        refresh_daily_stats(days_back=1, days=[datetime(2026, 9, 16, 23, tzinfo=KST)])

    rows = db.table.return_value.upsert.call_args.args[0]
    assert [(r["day"], r["total_count"]) for r in rows] == [("2026-09-16", 24)]


@patch("src.aggregators.hourly.get_supabase")
def test_daily_includes_top_issues(mock_get_supabase):
    posts = [
        _make_post(issue_summary="정령성 밸런스", posted_at="2026-05-01T01:00:00+00:00", post_id=1),
        _make_post(issue_summary="정령성 밸런스", posted_at="2026-05-01T02:00:00+00:00", post_id=2),
        _make_post(issue_summary="성역 난이도", posted_at="2026-05-01T03:00:00+00:00", post_id=3),
        _make_post(issue_summary=None, posted_at="2026-05-01T04:00:00+00:00", post_id=4),
    ]
    db = _db_mock()
    mock_get_supabase.return_value = db
    with patch.object(hourly, "_fetch_classified", side_effect=_fake_fetch(posts)):
        assert refresh_daily_stats(days_back=1, days=[date(2026, 5, 1)]) == 1

    row = db.table.return_value.upsert.call_args.args[0][0]
    assert row["top_issues"] == [{"summary": "정령성 밸런스", "count": 2}, {"summary": "성역 난이도", "count": 1}]
    assert row["total_count"] == 4


@patch("src.aggregators.hourly.get_supabase")
def test_daily_returns_zero_on_empty(mock_get_supabase):
    db = _db_mock()
    mock_get_supabase.return_value = db
    with patch.object(hourly, "_fetch_classified", return_value=[]):
        assert refresh_daily_stats(days_back=2) == 0
    db.table.return_value.upsert.assert_not_called()


def test_daily_ignores_future_days():
    with patch.object(hourly, "_fetch_classified", return_value=[]) as fetch, \
         patch("src.aggregators.hourly.get_supabase", return_value=_db_mock()):
        refresh_daily_stats(days_back=1, days=[date(2999, 1, 1)])
    for call in fetch.call_args_list:
        assert call.args[2] <= datetime.now(tz=KST) + timedelta(days=1)
