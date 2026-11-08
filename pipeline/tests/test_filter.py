"""정규식 스팸 필터 단위 테스트."""

import pytest

from src.processors.filter import ad_signal_count, is_spam


# ── 정상 게시글 (인벤 아이온2 실제 제목) ─────────────────────────────────────

@pytest.mark.parametrize("title", [
    "마도성 스킬 쿨다운 너무 길어요 진짜",
    "글라디에이터 버프 감사합니다 드디어 쓸만해짐",
    "호법성 초보용 스킬 트리 추천해드립니다",
    "오늘 서버 점검 몇 시까지인지 아시는 분",
    "이번 패치로 PvP 밸런스 많이 나아진 것 같아요",
])
def test_normal_posts(title):
    assert is_spam({"title": title}) is False


@pytest.mark.parametrize("title", [
    # 예전 '15자 미만' 규칙에 걸려 스팸으로 버려지던 실제 글들
    "수호성 뒈짓",
    "그냥 망한거 같은데",
    "저도떠날게요 형들",
    "악몽 28초 성공",
    "망겜 ㅅㅂ",
    "깼다...",
])
def test_short_titles_are_not_spam(title):
    assert is_spam({"title": title}) is False


@pytest.mark.parametrize("title", [
    # 예전 '같은 글자 5번 반복' 규칙에 걸리던 일상 표현
    "1인던전 ㅋㅋㅋㅋㅋ살성만너프",
    "쌍피증 떳다! ㅅㅅㅅㅅㅅ",
    "아니 이게 뭐임?????",
])
def test_repeated_chars_are_not_spam(title):
    assert is_spam({"title": title}) is False


@pytest.mark.parametrize("title", [
    # 광고를 언급·비판하는 정상 글 (광고 신호 1개)
    "유툽 방송에서 계정 판매 키나 판매소 광고하는데 정지 안먹이냐?",
    "통디 할거면 꼭 10인방에서 해",
    "통디가 2개임?",
])
def test_posts_mentioning_ads_are_not_spam(title):
    assert is_spam({"title": title}) is False


# ── 스팸 게시글 ───────────────────────────────────────────────────────────────

@pytest.mark.parametrize("title", [
    # 운영 DB에서 확인된 작업장 광고 서식
    "✅4만명회원✅최대규모통디✅키나판매✅성역4클리어✅",
    "｜4만명 회원보유｜키나판매｜최대규모 통디｜",
    "✅ 4만명 회원보유｜키나판매｜최대규모 통디✅",
    # URL + 판매
    "아이온2 골드 판매합니다 www.goldshop.com 문의주세요",
    # 메신저 아이디 광고
    "카카오 아이디: aion_gold_seller 최저가 보장",
    # 전화번호 포함
    "아이온2 대리 010-1234-5678 문의",
    # 이모지·특수문자만
    "●▅▇█▆▄▇",
])
def test_spam_posts(title):
    assert is_spam({"title": title}) is True


def test_ad_signal_count():
    assert ad_signal_count("｜4만명 회원보유｜키나판매｜최대규모 통디｜") >= 3
    # 신호 1개뿐인 글은 광고를 언급하는 정상 글일 수 있어 스팸으로 보지 않는다
    assert ad_signal_count("키나 판매소 광고하는데 정지 안먹이냐?") == 1
    assert ad_signal_count("통디 할거면 꼭 10인방에서 해") == 0


# ── 경계 케이스 ───────────────────────────────────────────────────────────────

def test_empty_title_is_spam():
    assert is_spam({"title": ""}) is True
    assert is_spam({"title": "   "}) is True


def test_missing_title_is_spam():
    assert is_spam({}) is True


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
