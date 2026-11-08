"""인벤 크롤러 테스트 — 네트워크·DB 없이 파싱·재시도·저장 로직만."""

from datetime import datetime
from unittest.mock import MagicMock, patch

import pytest
import requests

from src.collectors import inven
from src.collectors.inven import KST, _parse_posted_at

NOW = datetime(2026, 7, 21, 11, 4, tzinfo=KST)


# ── 날짜 파싱 ─────────────────────────────────────────────────────────────────

def test_parse_time_only_is_today():
    assert _parse_posted_at("09:15", now=NOW) == datetime(2026, 7, 21, 9, 15, tzinfo=KST)


def test_parse_month_day_dash_format():
    """'07-19' — 이전엔 파싱 실패로 현재 시각이 들어가 '오늘 글'로 잘못 집계됐다."""
    assert _parse_posted_at("07-19", now=NOW) == datetime(2026, 7, 19, tzinfo=KST)


def test_parse_month_day_with_time():
    assert _parse_posted_at("04.21 12:30", now=NOW) == datetime(2026, 4, 21, 12, 30, tzinfo=KST)


def test_parse_full_date():
    assert _parse_posted_at("2025.12.30 08:00", now=NOW) == datetime(2025, 12, 30, 8, 0, tzinfo=KST)
    assert _parse_posted_at("2025-12-30 08:00", now=NOW) == datetime(2025, 12, 30, 8, 0, tzinfo=KST)


def test_year_rollover_for_dates_without_year():
    new_year = datetime(2027, 1, 1, 0, 30, tzinfo=KST)
    assert _parse_posted_at("12-31", now=new_year) == datetime(2026, 12, 31, tzinfo=KST)
    assert _parse_posted_at("12.31 23:50", now=new_year) == datetime(2026, 12, 31, 23, 50, tzinfo=KST)


def test_unparseable_falls_back_to_now():
    assert _parse_posted_at("어제", now=NOW) == NOW


# ── 재시도·robots.txt ─────────────────────────────────────────────────────────

def _resp(status: int, text: str = "", headers: dict | None = None) -> MagicMock:
    r = MagicMock()
    r.status_code = status
    r.text = text
    r.headers = headers or {}
    if status >= 400:
        r.raise_for_status.side_effect = requests.HTTPError(response=r)
    return r


@pytest.fixture
def fake_session(monkeypatch):
    session = MagicMock()
    monkeypatch.setattr(inven, "_session", session)
    monkeypatch.setattr(inven, "_robots_cache", inven._ROBOTS_UNSET)
    monkeypatch.setattr("src.retry.time.sleep", lambda _s: None)
    monkeypatch.setattr("src.collectors.inven.time.sleep", lambda _s: None)
    inven.reset_crawl_stats()
    return session


_LIST_HTML = """
<ul><li><a class="tit" href="/board/aion2/6388/101">검성 상향 패치 체감 후기 공유합니다</a>
<span class="writer">닉</span><span class="date">09:15</span></li></ul>
"""


def test_page_fetch_retries_timeouts_then_succeeds(fake_session):
    fake_session.get.side_effect = [
        _resp(404),                                   # robots.txt 없음 → 허용
        requests.ConnectTimeout("connect timeout"),   # 1차 실패
        _resp(503),                                   # 2차 실패 (5xx)
        _resp(200, _LIST_HTML),                       # 3차 성공
    ]
    posts = inven.collect_inven_aion2(board_id=6388, max_pages=1)
    assert [p["external_id"] for p in posts] == ["6388_101"]
    assert inven.crawl_stats.retries == 2
    assert inven.crawl_stats.pages_ok == 1 and inven.crawl_stats.pages_failed == 0


def test_page_fetch_gives_up_and_counts_failure(fake_session):
    fake_session.get.side_effect = [_resp(404)] + [requests.ConnectTimeout("down")] * 3
    assert inven.collect_inven_aion2(board_id=6388, max_pages=2) == []
    assert inven.crawl_stats.pages_failed == 1  # 첫 페이지 실패 → 다음 페이지 시도 안 함
    assert fake_session.get.call_count == 4     # robots 1 + 페이지 3회 시도


def test_client_error_is_not_retried(fake_session):
    fake_session.get.side_effect = [_resp(404), _resp(404)]
    assert inven.collect_inven_aion2(board_id=6388) == []
    assert inven.crawl_stats.retries == 0


def test_robots_fetched_once_with_timeout(fake_session):
    """robots.txt는 프로세스당 1회만, 타임아웃을 걸고 조회한다 (예전엔 게시판마다·무제한 대기)."""
    fake_session.get.side_effect = [
        _resp(200, "User-agent: *\nAllow: /\n"),
        _resp(200, _LIST_HTML),
        _resp(200, _LIST_HTML),
    ]
    inven.collect_inven_aion2(board_id=6388)
    inven.collect_inven_aion2(board_id=6388)
    robots_calls = [c for c in fake_session.get.call_args_list if c.args[0].endswith("/robots.txt")]
    assert len(robots_calls) == 1
    assert robots_calls[0].kwargs["timeout"] == inven._REQUEST_TIMEOUT


def test_robots_unreachable_is_treated_as_allowed(fake_session):
    fake_session.get.side_effect = [requests.ConnectTimeout("down"), _resp(200, _LIST_HTML)]
    assert len(inven.collect_inven_aion2(board_id=6388)) == 1


def test_robots_disallow_blocks_board(fake_session):
    fake_session.get.side_effect = [_resp(200, "User-agent: *\nDisallow: /board/\n")]
    assert inven.collect_inven_aion2(board_id=6388) == []
    assert fake_session.get.call_count == 1


# ── 저장 멱등성 ───────────────────────────────────────────────────────────────

def _post(ext: str) -> dict:
    return {"source": "inven_aion2", "external_id": ext, "title": "t", "posted_at": "2026-07-21T00:00:00+09:00"}


def test_save_posts_upserts_on_natural_key_without_overwriting():
    db = MagicMock()
    db.table.return_value.upsert.return_value.execute.return_value.data = [{"id": 1}]
    with patch("src.collectors.inven.get_supabase", return_value=db):
        inven.save_posts([_post("6388_1"), _post("6388_1"), _post("6388_2")])
    rows = db.table.return_value.upsert.call_args.args[0]
    kwargs = db.table.return_value.upsert.call_args.kwargs
    assert [r["external_id"] for r in rows] == ["6388_1", "6388_2"]  # 배치 내 중복 제거
    # ON CONFLICT (source, external_id) DO NOTHING — 재실행해도 행이 늘지 않고 분류 결과도 보존
    assert kwargs == {"on_conflict": "source,external_id", "ignore_duplicates": True}
