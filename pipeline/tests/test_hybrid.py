"""하이브리드 분류기 테스트 — v1(기존)과 v2(실험)의 판정 순서 차이 검증.

Gemini 호출이 없는 무료 경로(use_gemini=False)만 다룬다.
"""

from src.processors.hybrid import classify_hybrid, classify_hybrid_v2_experimental


# ── v1 vs v2: 질문 형식을 빌린 불만 글 ────────────────────────────────────────

def test_v1_question_mark_forces_neutral_even_with_negative_keywords():
    """v1: 물음표가 있으면 부정 키워드('튕기')가 있어도 즉시 neutral 확정."""
    post = {"title": "이거 왜 자꾸 튕기나요??", "body": ""}
    result, api_called = classify_hybrid(post, use_gemini=False)

    assert result["sentiment"] == "neutral"
    assert result["model"] == "question-filter"
    assert api_called is False


def test_v2_strong_negative_signal_overrides_question_format():
    """v2: 키워드 강신호가 있으면 질문 형식이어도 키워드 판정 (핵심 차이)."""
    post = {"title": "이거 왜 자꾸 튕기나요??", "body": ""}
    result, api_called = classify_hybrid_v2_experimental(post, use_gemini=False)

    assert result["sentiment"] == "negative"
    assert result["model"] == "local-keyword"
    assert api_called is False


# ── v1 == v2: 순수 질문·강신호·애매글은 동일하게 동작 ─────────────────────────

def test_both_versions_neutral_for_pure_question():
    """감성 키워드 없는 순수 질문은 두 버전 모두 neutral."""
    post = {"title": "pvp 명중셋 회피셋 치명타 몇 나오시나요?", "body": ""}
    v1, _ = classify_hybrid(post, use_gemini=False)
    v2, _ = classify_hybrid_v2_experimental(post, use_gemini=False)

    assert v1["sentiment"] == "neutral"
    assert v2["sentiment"] == "neutral"


def test_both_versions_keyword_verdict_for_strong_signal_statement():
    """질문 형식이 아닌 강신호 글은 두 버전 모두 키워드 판정."""
    post = {"title": "싀벌꺼 접을란다 진짜 망겜", "body": ""}
    v1, _ = classify_hybrid(post, use_gemini=False)
    v2, _ = classify_hybrid_v2_experimental(post, use_gemini=False)

    assert v1["sentiment"] == "negative"
    assert v2["sentiment"] == "negative"


def test_both_versions_defer_ambiguous_without_budget():
    """애매한 의견글 + Gemini 예산 없음 → 두 버전 모두 보류(None)."""
    post = {"title": "오늘 업데이트 소감", "body": ""}
    v1, v1_called = classify_hybrid(post, use_gemini=False)
    v2, v2_called = classify_hybrid_v2_experimental(post, use_gemini=False)

    assert v1 is None and v1_called is False
    assert v2 is None and v2_called is False
