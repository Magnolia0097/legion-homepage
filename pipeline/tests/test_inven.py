"""인벤 크롤러 테스트 — 네트워크·DB 없이 파싱·재시도·저장 로직만."""

from datetime import datetime

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
