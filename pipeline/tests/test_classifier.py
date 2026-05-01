"""Gemini 분류기 단위 테스트 — API mock 사용."""

from unittest.mock import MagicMock, patch

import pytest

from src.processors.classifier import (
    VALID_CATEGORIES,
    VALID_SENTIMENTS,
    classify_post,
)


# ── mock 헬퍼 ─────────────────────────────────────────────────────────────────

def _mock_client(json_text: str) -> MagicMock:
    response = MagicMock()
    response.text = json_text
    client = MagicMock()
    client.models.generate_content.return_value = response
    return client


# ── 정상 분류 ──────────────────────────────────────────────────────────────────

@patch("src.processors.classifier._get_client")
def test_positive_classification(mock_get_client):
    mock_get_client.return_value = _mock_client(
        '{"sentiment":"positive","categories":["클래스밸런스"],'
        '"issue_summary":"글라디 상향 패치 긍정 반응.","keywords":["글라디","상향"]}'
    )
    result = classify_post({"title": "글라디에이터 상향 패치 너무 좋아요 드디어"})

    assert result is not None
    assert result["sentiment"] == "positive"
    assert "클래스밸런스" in result["categories"]
    assert result["issue_summary"] is not None
    assert isinstance(result["keywords"], list)


@patch("src.processors.classifier._get_client")
def test_negative_classification(mock_get_client):
    mock_get_client.return_value = _mock_client(
        '{"sentiment":"negative","categories":["버그오류","클래스밸런스"],'
        '"issue_summary":"마도성 쿨다운 버그 지속.","keywords":["마도성","버그"]}'
    )
    result = classify_post({
        "title": "마도성 스킬 쿨다운 버그 아직도 안 고쳐짐",
        "body": "어제 패치 이후로 쿨다운이 표시랑 달라요",
    })

    assert result["sentiment"] == "negative"
    assert "버그오류" in result["categories"]


@patch("src.processors.classifier._get_client")
def test_neutral_classification(mock_get_client):
    mock_get_client.return_value = _mock_client(
        '{"sentiment":"neutral","categories":["커뮤니티"],'
        '"issue_summary":"서버 점검 시간 문의.","keywords":["점검"]}'
    )
    result = classify_post({"title": "오늘 서버 점검 몇 시까지인지 아시는 분"})
    assert result["sentiment"] == "neutral"


# ── 유효성 검증 ───────────────────────────────────────────────────────────────

@patch("src.processors.classifier._get_client")
def test_invalid_sentiment_falls_back_to_neutral(mock_get_client):
    """Gemini가 유효하지 않은 sentiment 반환 시 neutral로 교정."""
    mock_get_client.return_value = _mock_client(
        '{"sentiment":"unknown_value","categories":["기타"],'
        '"issue_summary":"테스트.","keywords":[]}'
    )
    result = classify_post({"title": "아이온2 관련 애매한 감성의 게시글 제목입니다"})
    assert result["sentiment"] == "neutral"


@patch("src.processors.classifier._get_client")
def test_invalid_categories_filtered_out(mock_get_client):
    """유효하지 않은 카테고리는 제거되고 기타로 대체."""
    mock_get_client.return_value = _mock_client(
        '{"sentiment":"neutral","categories":["존재하지않는카테고리"],'
        '"issue_summary":"테스트.","keywords":[]}'
    )
    result = classify_post({"title": "카테고리 유효성 테스트용 게시글입니다요"})
    assert result["categories"] == ["기타"]


@patch("src.processors.classifier._get_client")
def test_categories_capped_at_3(mock_get_client):
    """카테고리 최대 3개 제한."""
    mock_get_client.return_value = _mock_client(
        '{"sentiment":"neutral","categories":["클래스밸런스","버그오류","콘텐츠","이벤트과금"],'
        '"issue_summary":"테스트.","keywords":[]}'
    )
    result = classify_post({"title": "여러 카테고리에 해당하는 게시글 테스트용도"})
    assert len(result["categories"]) <= 3


@patch("src.processors.classifier._get_client")
def test_keywords_capped_at_5(mock_get_client):
    """키워드 최대 5개 제한."""
    mock_get_client.return_value = _mock_client(
        '{"sentiment":"positive","categories":["기타"],'
        '"issue_summary":"테스트.","keywords":["a","b","c","d","e","f","g"]}'
    )
    result = classify_post({"title": "키워드가 너무 많이 반환되는 경우 테스트용"})
    assert len(result["keywords"]) <= 5


# ── 오류 처리 ─────────────────────────────────────────────────────────────────

@patch("src.processors.classifier._get_client")
def test_api_error_returns_none(mock_get_client):
    """Gemini API 오류 시 None 반환."""
    client = MagicMock()
    client.models.generate_content.side_effect = Exception("API 오류")
    mock_get_client.return_value = client

    result = classify_post({"title": "아이온2 관련 정상적인 게시글 제목입니다"})
    assert result is None


@patch("src.processors.classifier._get_client")
def test_invalid_json_returns_none(mock_get_client):
    """JSON 파싱 실패 시 None 반환."""
    mock_get_client.return_value = _mock_client("이것은 JSON이 아닙니다")
    result = classify_post({"title": "아이온2 관련 정상적인 게시글 제목입니다"})
    assert result is None


@patch("src.processors.classifier._get_client")
def test_empty_issue_summary_becomes_none(mock_get_client):
    """빈 issue_summary는 None으로 변환."""
    mock_get_client.return_value = _mock_client(
        '{"sentiment":"neutral","categories":["기타"],'
        '"issue_summary":"","keywords":[]}'
    )
    result = classify_post({"title": "요약이 비어있는 경우 처리 테스트입니다요"})
    assert result["issue_summary"] is None


# ── 상수 검증 ─────────────────────────────────────────────────────────────────

def test_valid_sentiments_set():
    assert VALID_SENTIMENTS == {"positive", "negative", "neutral"}


def test_valid_categories_list():
    assert len(VALID_CATEGORIES) == 6
    assert "기타" in VALID_CATEGORIES
