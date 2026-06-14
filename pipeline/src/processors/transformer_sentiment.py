"""무료·무제한 로컬 한국어 감성 트랜스포머 분류기.

키워드 사전(local_sentiment)과 달리 단어가 아니라 **문장 전체 의미**를 보는
BERT 계열 감성 모델을 GitHub Actions 러너의 CPU에서 직접 실행한다.
외부 API가 아니므로 호출 한도·비용이 전혀 없고, 반어·이중부정 같은 맥락도
키워드보다 훨씬 잘 잡는다.

모델은 한국어 감성(긍/부) 이진 분류기를 기본으로 쓰고,
모델 확신도가 애매하면(neutral 구간) '중립'으로 처리한다.

- 감성(sentiment): 트랜스포머 모델이 판정
- 카테고리/키워드: local_sentiment의 키워드 로직 재사용 (그룹핑 용도라 정확도 영향 적음)

모델 로딩/추론 실패 시 keyword 분류기로 자동 폴백해 파이프라인이 멈추지 않는다.
"""

from __future__ import annotations

import logging

from ..config import get_settings
from .local_sentiment import _categorize, _extract_keywords, classify_local

logger = logging.getLogger(__name__)

# 모델 확신도가 이 구간 안이면(긍정확률이 [0.5-margin, 0.5+margin]) 중립으로 판정.
# 이진 모델이라 pos+neg≈1 → |pos-neg| < 2*margin 이면 애매 → neutral.
_NEUTRAL_MARGIN = 0.20  # 긍정확률 0.30~0.70 → 중립

_pipe = None
_load_failed = False


def _get_pipe():
    """transformers 파이프라인을 지연 로딩 (최초 호출 시 1회)."""
    global _pipe, _load_failed
    if _pipe is not None or _load_failed:
        return _pipe
    try:
        from transformers import pipeline  # 무거운 import라 함수 안에서

        model_name = get_settings().transformer_model
        logger.info("감성 트랜스포머 로딩: %s", model_name)
        _pipe = pipeline("text-classification", model=model_name, top_k=None)
        logger.info("감성 트랜스포머 로딩 완료")
    except Exception as exc:  # 모델 다운로드/로딩 실패 → 키워드 폴백
        logger.warning("트랜스포머 로딩 실패 — 키워드 분류기로 폴백: %s", exc)
        _load_failed = True
    return _pipe


def _label_to_polarity(label: str) -> str | None:
    """모델별로 제각각인 라벨명을 'pos'/'neg'로 정규화.

    NSMC 계열: LABEL_0=부정, LABEL_1=긍정.
    이름 기반(positive/negative, 긍정/부정)도 함께 처리.
    """
    low = label.lower()
    if "pos" in low or "긍" in low or low.endswith("1"):
        return "pos"
    if "neg" in low or "부" in low or low.endswith("0"):
        return "neg"
    return None


def classify_transformer(post: dict) -> dict:
    """게시글 하나를 트랜스포머 감성 모델로 분류.

    Returns:
        {"sentiment", "categories", "issue_summary", "keywords", "model"}
        — Gemini classify_post과 동일한 형식.
    """
    pipe = _get_pipe()
    if pipe is None:
        # 모델 사용 불가 → 키워드 분류로 폴백
        return classify_local(post)

    title = (post.get("title") or "").strip()
    body = (post.get("body") or "").strip()
    text = f"{title} {body}".strip()[:512]  # BERT 최대 토큰 보호
    if not text:
        return classify_local(post)

    try:
        scores = pipe(text)[0]  # [{"label":..., "score":...}, ...]
    except Exception as exc:
        logger.warning("트랜스포머 추론 실패 (title=%r) — 키워드 폴백: %s", title[:30], exc)
        return classify_local(post)

    pos_prob = neg_prob = 0.0
    for s in scores:
        pol = _label_to_polarity(str(s.get("label", "")))
        if pol == "pos":
            pos_prob = float(s.get("score", 0.0))
        elif pol == "neg":
            neg_prob = float(s.get("score", 0.0))

    # 라벨 매핑 실패(둘 다 0) → 키워드 폴백
    if pos_prob == 0.0 and neg_prob == 0.0:
        return classify_local(post)

    if abs(pos_prob - neg_prob) < 2 * _NEUTRAL_MARGIN:
        sentiment = "neutral"
    elif pos_prob > neg_prob:
        sentiment = "positive"
    else:
        sentiment = "negative"

    return {
        "sentiment": sentiment,
        "categories": _categorize(text),
        "issue_summary": title or None,
        "keywords": _extract_keywords(text),
        "model": f"transformer:{get_settings().transformer_model}",
    }
