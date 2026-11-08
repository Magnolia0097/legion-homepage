"""지수 백오프 재시도 헬퍼 테스트."""

import pytest

from src.retry import backoff_delay, call_with_retry


class Transient(Exception):
    pass


class Fatal(Exception):
    pass


def _flaky(failures: list[Exception], value="ok"):
    calls = {"n": 0}

    def fn():
        calls["n"] += 1
        if failures:
            raise failures.pop(0)
        return value

    return fn, calls


def test_backoff_grows_exponentially_and_caps(monkeypatch):
    monkeypatch.setattr("src.retry.random.uniform", lambda a, b: 0.0)  # 지터 제거
    assert [backoff_delay(i, base=2, cap=10) for i in (1, 2, 3, 4)] == [2, 4, 8, 10]


def test_retries_transient_then_succeeds():
    fn, calls = _flaky([Transient(), Transient()])
    sleeps = []
    assert call_with_retry(fn, is_retryable=lambda e: isinstance(e, Transient),
                           attempts=3, sleep=sleeps.append) == "ok"
    assert calls["n"] == 3 and len(sleeps) == 2


def test_gives_up_after_attempts():
    fn, calls = _flaky([Transient(), Transient(), Transient()])
    with pytest.raises(Transient):
        call_with_retry(fn, is_retryable=lambda e: True, attempts=3, sleep=lambda _: None)
    assert calls["n"] == 3


def test_non_retryable_raises_immediately():
    fn, calls = _flaky([Fatal()])
    with pytest.raises(Fatal):
        call_with_retry(fn, is_retryable=lambda e: isinstance(e, Transient), sleep=lambda _: None)
    assert calls["n"] == 1


def test_min_delay_and_retry_after_hint():
    exc = Transient()
    exc.retry_after = 9
    fn, _ = _flaky([Transient(), exc])
    sleeps = []
    call_with_retry(fn, is_retryable=lambda e: True, attempts=3, base=0.1, cap=30,
                    min_delay=3.0, sleep=sleeps.append)
    assert sleeps[0] >= 3.0       # 서버 예절 최소 간격
    assert sleeps[1] == 9         # Retry-After가 더 길면 그 값을 따른다
