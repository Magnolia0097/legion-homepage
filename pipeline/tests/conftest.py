"""pytest 공통 설정 — 테스트를 로컬 .env·실제 키와 완전히 분리한다.

Settings는 환경변수를 .env 파일보다 우선하므로, 여기서 더미 값을 덮어써 두면
개발자 PC에 실제 .env가 있어도 테스트가 실제 Supabase·Gemini 키를 읽지 않는다.
(CI에는 .env가 없어 필수 필드 누락으로 Settings 생성이 실패하던 문제도 함께 해결)
"""

import os

import pytest

_TEST_ENV = {
    "GEMINI_API_KEY": "test-gemini-key",
    "GEMINI_MODEL": "gemini-2.5-flash-lite",
    "SUPABASE_URL": "http://localhost:54321",
    "SUPABASE_ANON_KEY": "test-anon-key",
    "SUPABASE_SERVICE_ROLE_KEY": "test-service-role-key",
    "CLASSIFIER_MODE": "hybrid",
    "GEMINI_CALLS_PER_RUN": "12",
    "INVEN_BOARD_IDS": "6388,6438,6448,6449,6450,6451,6452,6453,6454",
}

# 테스트 모듈 import 전에 적용돼야 하므로 fixture가 아닌 모듈 레벨에서 설정
os.environ.update(_TEST_ENV)
os.environ.pop("GITHUB_STEP_SUMMARY", None)  # 테스트가 CI 요약 파일에 쓰지 않도록


@pytest.fixture(autouse=True)
def _fresh_settings():
    """테스트마다 Settings 캐시를 비워 monkeypatch한 환경변수가 반영되게 한다."""
    from src.config import get_settings

    get_settings.cache_clear()
    yield
    get_settings.cache_clear()
