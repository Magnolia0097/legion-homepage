"""정규식 + 키워드 기반 1차 스팸 필터.

LLM(Gemini) 호출 전 명확한 스팸/광고를 걸러내는 Tier-1 필터.
비용 0원으로 LLM 호출 수를 줄이는 것이 목적.

FILTER_RULES 딕셔너리로 규칙을 관리하므로, 새 패턴 추가/수정이 쉽다.
"""

from __future__ import annotations

import re

# ── 필터 규칙 딕셔너리 ────────────────────────────────────────────────────────
# 각 키: 규칙 이름 (로깅용)
# 각 값: (compiled_pattern | None, description)
#   pattern이 None이면 별도 로직으로 처리 (길이 체크 등)

FILTER_RULES: dict[str, re.Pattern | None] = {
    # 광고: URL + 판매/문의 키워드 조합
    "ad_url_sale": re.compile(
        r"(https?://|www\.)\S+"           # URL 포함
        r".{0,50}"                         # 사이에 최대 50자
        r"(판매|문의|할인|쿠폰|이벤트|특가|구매|주문|결제)",
        re.DOTALL,
    ),
    # 광고: 문의 유도 문구
    "ad_contact": re.compile(
        r"(카카오|카톡|라인|텔레그램|디스코드)\s*(아이디|ID|id)?\s*[:：]\s*\S+",
        re.IGNORECASE,
    ),
    # 광고: 전화번호 패턴
    "ad_phone": re.compile(r"0\d{1,2}[-\s]?\d{3,4}[-\s]?\d{4}"),
    # 스팸: 반복 문자 (같은 문자 5회 이상 연속)
    "repeat_chars": re.compile(r"(.)\1{4,}"),
    # 스팸: 이모지/특수문자만 (한글·영문·숫자 없음)
    "emoji_only": re.compile(r"^[^\w가-힣a-zA-Z0-9]+$"),
}

# 제목 최소 길이 (이 미만이면 스팸)
MIN_TITLE_LENGTH = 15


def is_spam(post: dict) -> bool:
    """게시글이 스팸/광고인지 판단.

    Args:
        post: voice_raw_posts 스키마의 dict
              (최소 'title' 키 필요, 'body'는 없어도 됨)

    Returns:
        True: 스팸 → LLM 분류 건너뜀
        False: 정상 → LLM 분류 대상
    """
    title: str = (post.get("title") or "").strip()
    body: str = (post.get("body") or "").strip()
    text = f"{title} {body}".strip()

    # 규칙 1: 제목 길이
    if len(title) < MIN_TITLE_LENGTH:
        return True

    # 규칙 2~N: 정규식 패턴 매칭
    for _rule_name, pattern in FILTER_RULES.items():
        if pattern and pattern.search(text):
            return True

    return False
