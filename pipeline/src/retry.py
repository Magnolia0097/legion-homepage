"""지수 백오프 재시도 — 크롤러·LLM 호출 공용.

일시적 오류(네트워크 타임아웃, 5xx 등)만 재시도하고, 재시도해도 결과가 같은 오류
(인증 실패, 쿼터 소진, 404)는 바로 올려 보낸다. 무엇이 재시도 대상인지는 호출자가
is_retryable로 정한다.
"""

from __future__ import annotations

import logging
import random
import time
from collections.abc import Callable
from typing import TypeVar

logger = logging.getLogger(__name__)

T = TypeVar("T")


def backoff_delay(attempt: int, base: float, cap: float, jitter: float = 0.5) -> float:
    """attempt(1부터)번째 실패 후 대기 시간: base·2^(attempt-1), 상한 cap, ±jitter 비율 흔들기.

    jitter는 여러 작업이 같은 순간에 재시도하며 서버를 다시 때리는 것을 막는다.
    """
    delay = min(cap, base * (2 ** (attempt - 1)))
    return max(0.0, delay * (1 + random.uniform(-jitter, jitter)))


def call_with_retry(
    fn: Callable[[], T],
    *,
    is_retryable: Callable[[BaseException], bool],
    attempts: int = 3,
    base: float = 2.0,
    cap: float = 30.0,
    min_delay: float = 0.0,
    on_retry: Callable[[int, BaseException, float], None] | None = None,
    sleep: Callable[[float], None] | None = None,
) -> T:
    """fn()을 최대 attempts번 시도. 재시도 불가 오류나 마지막 시도의 오류는 그대로 raise.

    예외에 retry_after(초) 속성이 있으면(HTTP 429/503의 Retry-After) 백오프보다 길 때 그 값을
    따르되 cap을 넘지 않는다. min_delay는 상대 서버 예절상 최소 간격(크롤러 3초 등).
    """
    for attempt in range(1, attempts + 1):
        try:
            return fn()
        except Exception as exc:  # noqa: BLE001 — 판정은 is_retryable에 위임
            if attempt == attempts or not is_retryable(exc):
                raise
            delay = max(min_delay, backoff_delay(attempt, base, cap))
            hint = getattr(exc, "retry_after", None)
            if isinstance(hint, (int, float)) and hint > delay:
                delay = min(float(hint), cap)
            if on_retry:
                on_retry(attempt, exc, delay)
            logger.warning("재시도 %d/%d (%.1fs 후): %s", attempt, attempts - 1, delay, exc)
            (sleep or time.sleep)(delay)  # 호출 시점에 조회 → 테스트에서 time.sleep 패치 가능
    raise AssertionError("unreachable")  # pragma: no cover
