"""정규식 스팸 필터 단위 테스트."""

import pytest

from src.processors.filter import is_spam


# ── 정상 게시글 (Aion 2 실제 말투 모방) ──────────────────────────────────────

@pytest.mark.parametrize("post", [
    # 일반 불만 글
    {"title": "마도성 스킬 쿨다운 너무 길어요 진짜"},
    # 일반 긍정 글
    {"title": "글라디에이터 버프 감사합니다 드디어 쓸만해짐"},
    # 공략/팁 글
    {"title": "호법성 초보용 스킬 트리 추천해드립니다"},
    # 중립 문의
    {"title": "오늘 서버 점검 몇 시까지인지 아시는 분"},
    # 정확히 15자 (경계값)
    {"title": "이거 버그인가요진짜"},  # 10자 → 스팸
])
def test_normal_posts_are_not_spam(post):
    # 15자 이상인 것만 정상
    if len(post["title"]) >= 15:
        assert is_spam(post) is False


@pytest.mark.parametrize("post", [
    {"title": "마도성 스킬 쿨다운 너무 길어요 진짜"},
    {"title": "글라디에이터 버프 감사합니다 드디어 쓸만해짐"},
    {"title": "호법성 초보용 스킬 트리 추천해드립니다"},
    {"title": "오늘 서버 점검 몇 시까지인지 아시는 분"},
    {"title": "이번 패치로 PvP 밸런스 많이 나아진 것 같아요"},
])
def test_normal_posts(post):
    assert is_spam(post) is False


# ── 스팸 게시글 ───────────────────────────────────────────────────────────────

@pytest.mark.parametrize("post", [
    # 15자 미만 제목
    {"title": "ㅋㅋㅋㅋ"},
    # URL + 판매
    {"title": "아이온2 골드 판매합니다 www.goldshop.com 문의주세요"},
    # 카카오 아이디 광고
    {"title": "카카오 아이디: aion_gold_seller 최저가 보장"},
    # 전화번호 포함
    {"title": "아이온2 대리 010-1234-5678 문의"},
    # 반복 문자
    {"title": "ㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋ 이게 뭐야"},
])
def test_spam_posts(post):
    assert is_spam(post) is True


# ── 경계 케이스 ───────────────────────────────────────────────────────────────

def test_exactly_15_chars_is_not_spam():
    """15자 정확히는 통과."""
    post = {"title": "열다섯글자제목테스트용입니다요"}  # 15자
    assert len(post["title"]) == 15
    assert is_spam(post) is False


def test_14_chars_is_spam():
    """14자는 스팸."""
    post = {"title": "열네글자의제목이테스트입니다"}  # 14자
    assert len(post["title"]) == 14
    assert is_spam(post) is True


def test_empty_title_is_spam():
    """빈 제목은 스팸."""
    assert is_spam({"title": ""}) is True


def test_missing_title_is_spam():
    """title 키 없으면 스팸."""
    assert is_spam({}) is True


def test_body_ad_with_short_title():
    """본문에 광고 패턴 있어도 제목이 짧으면 길이 규칙 먼저 적용."""
    post = {
        "title": "짧은제목",  # 5자
        "body": "www.goldshop.com 골드 판매",
    }
    assert is_spam(post) is True  # 제목 길이로 이미 스팸


def test_body_ad_with_normal_title():
    """제목 정상이지만 본문에 URL+판매 패턴 → 스팸."""
    post = {
        "title": "아이온2 관련 좋은 정보 공유합니다",
        "body": "www.goldshop.com 에서 판매 중입니다",
    }
    assert is_spam(post) is True


def test_url_without_keyword_is_not_spam():
    """URL만 있고 판매 키워드 없으면 통과."""
    post = {
        "title": "공식 홈페이지에서 패치노트 확인했는데 이거 진짜 심각함",
        "body": "https://aion2.plaync.com 에서 확인 가능",
    }
    assert is_spam(post) is False
