"""하이브리드 분류기 — 무료 키워드 + 필요할 때만 Gemini LLM.

Gemini 무료 한도(하루 수십 건 RPD)를 넘기지 않으면서 LLM 품질을 활용하기 위한 절충.

분류 흐름:
1. 질문·정보 요청 글  → 중립 (호출 0, 무료)
2. 키워드 강신호 글   → 키워드 판정 (호출 0, 무료) — 욕설/졸업 등 명백한 글
3. 애매한 의견글
   - 이번 실행에 Gemini 예산이 있으면 → Gemini 호출
   - 예산이 없으면 → 분류를 미룸(deferred). 다음 실행에서 Gemini로 재시도.
     (애매한 글을 어설픈 키워드 라벨로 확정해버리지 않기 위함 — 품질 우선)

결과적으로 Gemini 호출은 "사람도 헷갈릴 만한 의견글"에만 집중돼 호출 수가 확 줄고,
대부분의 글은 무료 경로로 즉시 처리된다. 애매한 글은 매 실행 LLM 예산만큼 점진 소화.
"""

from __future__ import annotations

import logging

from .classifier import classify_post
from .local_sentiment import (
    _categorize,
    _extract_keywords,
    classify_local,
    is_question,
    score_sentiment,
)

logger = logging.getLogger(__name__)

# |부정-긍정| 점수 차가 이 값 이상이면 키워드만으로 확신 → Gemini 호출 안 함(무료).
_STRONG_SIGNAL = 2


def classify_hybrid(post: dict, use_gemini: bool) -> tuple[dict | None, bool]:
    """게시글 하나를 하이브리드로 분류.

    Args:
        use_gemini: 이번 글에 Gemini 호출을 허용할지 (실행당 예산이 남아있는지).

    Returns:
        (result, api_called)
        - result: 분류 dict. None이면 "이번엔 분류 보류(deferred)" — 다음 실행에서 재시도.
        - api_called: 실제로 Gemini API 요청을 보냈는지 (성공·파싱실패 무관, 예산 차감용).

    Raises:
        QuotaExhausted: Gemini 쿼터 소진 — 호출자가 이후 Gemini를 끄도록 전파.
    """
    title = (post.get("title") or "").strip()
    body = (post.get("body") or "").strip()
    text = f"{title} {body}".strip()

    # 1. 질문·정보 요청 → 중립 (무료)
    if is_question(title):
        return {
            "sentiment": "neutral",
            "categories": _categorize(text),
            "issue_summary": title or None,
            "keywords": _extract_keywords(text),
            "model": "question-filter",
        }, False

    # 2. 키워드 강신호 → 키워드 판정 (무료)
    neg, pos = score_sentiment(post)
    if abs(neg - pos) >= _STRONG_SIGNAL:
        return classify_local(post), False

    # 3. 애매한 의견글
    if not use_gemini:
        # 예산 없음 → 보류. 다음 실행 Gemini 예산으로 재시도(어설픈 키워드 확정 회피).
        return None, False

    result = classify_post(post)  # QuotaExhausted는 호출자에게 전파
    if result is not None:
        return result, True
    # Gemini가 None(파싱 실패 등) → API는 썼으니 예산은 차감하고 키워드로 폴백
    return classify_local(post), True
