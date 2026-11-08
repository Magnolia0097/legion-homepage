"""정규식 기반 1차 스팸(광고) 필터.

LLM 호출 전에 명백한 광고만 걸러내는 Tier-1 필터. 비용 0원.

2026-11 개정
- 예전 규칙 중 '제목 15자 미만'과 '같은 글자 5번 이상 반복'이 정상 글을 대량으로 스팸 처리했다.
  전체 91,024건 중 10,660건이 spam이었고 그중 9,356건은 제목이 짧을 뿐인 정상 글이었다
  ("수호성 뒈짓", "그냥 망한거 같은데", "악몽 28초 성공"). 인벤 제목은 원래 짧고 'ㅋㅋㅋㅋㅋ'는
  일상 표현이라 두 규칙을 없앴다.
- 대신 실제로 확인된 작업장 광고 서식을 잡는다. 광고 신호(회원 수 자랑, 최대규모, 키나 판매,
  ✅·｜ 나열)가 2개 이상 겹칠 때만 스팸으로 본다. 신호 하나만 있는 글은 광고를 비판하는
  정상 글일 수 있다("키나 판매소 광고하는데 정지 안먹이냐?").
"""

from __future__ import annotations

import re

# ── 단독으로도 스팸으로 보는 강한 규칙 ─────────────────────────────────────────
FILTER_RULES: dict[str, re.Pattern] = {
    # 광고: URL + 판매/문의 키워드 조합
    "ad_url_sale": re.compile(
        r"(https?://|www\.)\S+"           # URL 포함
        r".{0,50}"                         # 사이에 최대 50자
        r"(판매|문의|할인|쿠폰|이벤트|특가|구매|주문|결제)",
        re.DOTALL,
    ),
    # 광고: 메신저 아이디 유도 문구
    "ad_contact": re.compile(
        r"(카카오|카톡|라인|텔레그램|디스코드)\s*(아이디|ID|id)?\s*[:：]\s*\S+",
        re.IGNORECASE,
    ),
    # 광고: 전화번호
    "ad_phone": re.compile(r"0\d{1,2}[-\s]?\d{3,4}[-\s]?\d{4}"),
    # 도배: 이모지·특수문자만 있고 글자가 없음
    "emoji_only": re.compile(r"^[^\w가-힣a-zA-Z0-9]+$"),
}

# ── 작업장 광고 신호 (2개 이상 겹치면 스팸) ─────────────────────────────────────
# 실제 광고 예: "✅4만명회원✅최대규모통디✅키나판매✅성역4클리어✅",
#              "｜4만명 회원보유｜키나판매｜최대규모 통디｜"
AD_SIGNALS: dict[str, re.Pattern] = {
    "member_count": re.compile(r"\d+\s*만\s*명\s*회원|회원\s*보유"),
    "largest_scale": re.compile(r"최대\s*규모"),
    "money_trade": re.compile(r"(키나|골드|게임머니)\s*(판매|매입|삽니다|팝니다|최저가)"),
    "check_list": re.compile(r"[✅✔☑].*[✅✔☑]"),
    "bar_list": re.compile(r"｜.*｜"),
}
MIN_AD_SIGNALS = 2


def ad_signal_count(text: str) -> int:
    """광고 신호가 몇 종류 들어 있는지."""
    return sum(1 for pattern in AD_SIGNALS.values() if pattern.search(text))


def is_spam(post: dict) -> bool:
    """게시글이 스팸/광고인지 판단.

    Args:
        post: voice_raw_posts 스키마의 dict (최소 'title', 'body'는 없어도 됨)

    Returns:
        True: 스팸 → LLM 분류 건너뜀
        False: 정상 → 분류 대상
    """
    title: str = (post.get("title") or "").strip()
    body: str = (post.get("body") or "").strip()
    text = f"{title} {body}".strip()

    # 제목이 비어 있으면 분류할 내용이 없다
    if not title:
        return True

    for pattern in FILTER_RULES.values():
        if pattern.search(text):
            return True

    return ad_signal_count(text) >= MIN_AD_SIGNALS
