"""Gemini 분류기 단위 테스트 — API mock 사용."""

import logging

from unittest.mock import MagicMock, patch

import pytest
from google.genai import errors as genai_errors

from src.processors import classifier as clf
from src.processors.classifier import (
    VALID_CATEGORIES,
    VALID_SENTIMENTS,
    classify_post,
    update_classification,
)


# ── mock 헬퍼 ─────────────────────────────────────────────────────────────────

def _mock_client(json_text: str) -> MagicMock:
    response = MagicMock()
    response.text = json_text
    client = MagicMock()
    client.models.generate_content.return_value = response
    return client


@pytest.fixture(autouse=True)
def mock_supabase():
    """폴백 로그·분류 저장이 실제 Supabase를 호출하지 않도록 전 테스트에서 mock."""
    with patch("src.processors.classifier.get_supabase") as mock:
        mock.return_value = MagicMock()
        yield mock


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
def test_invalid_sentiment_fallback_logs_warning(mock_get_client, caplog):
    """neutral 폴백 발동 시 logger.warning으로 제목·원본값·모델이 기록돼야 함."""
    mock_get_client.return_value = _mock_client(
        '{"sentiment":"mixed","categories":["기타"],'
        '"issue_summary":"테스트.","keywords":[]}'
    )
    with caplog.at_level(logging.WARNING, logger="src.processors.classifier"):
        result = classify_post({"title": "아이온2 관련 애매한 감성의 게시글 제목입니다"})

    assert result["sentiment"] == "neutral"
    warnings = [r for r in caplog.records if "sentiment" in r.getMessage()]
    assert len(warnings) == 1
    message = warnings[0].getMessage()
    assert "mixed" in message                       # 원본 raw 값
    assert "아이온2 관련 애매한 감성의 게시글 제목입니다"[:30] in message  # 제목 앞 30자
    assert result["model"] in message               # 실제 사용된 모델명


@patch("src.processors.classifier._get_client")
def test_invalid_sentiment_fallback_inserted_into_log_table(mock_get_client, mock_supabase):
    """폴백 발동 시 classification_fallback_log에 insert돼야 함."""
    mock_get_client.return_value = _mock_client(
        '{"sentiment":"unknown_value","categories":["기타"],'
        '"issue_summary":"테스트.","keywords":[]}'
    )
    classify_post({"id": 42, "title": "폴백 로그 insert 검증용 게시글 제목입니다"})

    db = mock_supabase.return_value
    db.table.assert_called_with("classification_fallback_log")
    inserted = db.table.return_value.insert.call_args[0][0]
    assert inserted["post_id"] == 42
    assert inserted["fallback_type"] == "invalid_sentiment"
    assert inserted["raw_value"] == "unknown_value"
    assert inserted["model"]  # 실제 사용된 모델명 포함


@patch("src.processors.classifier._get_client")
def test_category_filtering_logs_warning(mock_get_client, caplog):
    """유효하지 않은 카테고리가 걸러질 때도 동일하게 경고 로그를 남김."""
    mock_get_client.return_value = _mock_client(
        '{"sentiment":"neutral","categories":["콘텐츠","PvP","경제"],'
        '"issue_summary":"테스트.","keywords":[]}'
    )
    with caplog.at_level(logging.WARNING, logger="src.processors.classifier"):
        result = classify_post({"title": "카테고리 필터링 경고 로그 검증용 제목"})

    assert result["categories"] == ["콘텐츠"]
    warnings = [r for r in caplog.records if "카테고리" in r.getMessage()]
    assert len(warnings) == 1
    message = warnings[0].getMessage()
    assert "2개" in message      # 걸러진 개수
    assert "PvP" in message and "경제" in message


@patch("src.processors.classifier._get_client")
def test_fallback_log_failure_does_not_break_classification(mock_get_client, mock_supabase):
    """폴백 로그 insert 실패가 분류 결과 반환을 막으면 안 됨 (방어적 패턴)."""
    mock_get_client.return_value = _mock_client(
        '{"sentiment":"unknown_value","categories":["기타"],'
        '"issue_summary":"테스트.","keywords":[]}'
    )
    mock_supabase.return_value.table.side_effect = Exception("DB 연결 실패")

    result = classify_post({"title": "로그 실패에도 분류가 살아있는지 검증용"})
    assert result is not None
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


# ── classified_by_model 저장 ──────────────────────────────────────────────────

@patch("src.processors.classifier._get_client")
def test_result_contains_model(mock_get_client):
    """classify_post 결과에 실제 사용된 모델명이 포함돼야 함."""
    mock_get_client.return_value = _mock_client(
        '{"sentiment":"neutral","categories":["기타"],'
        '"issue_summary":"테스트.","keywords":[]}'
    )
    result = classify_post({"title": "모델명 필드 포함 여부 검증용 게시글 제목"})
    assert result["model"]  # 폴백 체인 중 실제 사용된 모델명


def test_update_classification_saves_model(mock_supabase):
    """update_classification이 result['model']을 classified_by_model 컬럼에 저장."""
    result = {
        "sentiment": "negative",
        "categories": ["버그오류"],
        "issue_summary": "테스트 요약.",
        "keywords": ["버그"],
        "model": "gemini-2.0-flash",
    }
    assert update_classification(7, result) is True

    update_dict = mock_supabase.return_value.table.return_value.update.call_args[0][0]
    assert update_dict["classified_by_model"] == "gemini-2.0-flash"


def test_update_classification_without_model_key(mock_supabase):
    """model 키가 없는 result(과거 형식)도 오류 없이 저장 (None으로)."""
    result = {
        "sentiment": "neutral",
        "categories": ["기타"],
        "issue_summary": None,
        "keywords": [],
    }
    assert update_classification(8, result) is True

    update_dict = mock_supabase.return_value.table.return_value.update.call_args[0][0]
    assert update_dict["classified_by_model"] is None


# ── 상수 검증 ─────────────────────────────────────────────────────────────────

def test_valid_sentiments_set():
    assert VALID_SENTIMENTS == {"positive", "negative", "neutral"}


def test_valid_categories_list():
    assert len(VALID_CATEGORIES) == 6
    assert "기타" in VALID_CATEGORIES


# ── 재시도·오류 분류·호출 지표 ────────────────────────────────────────────────

_OK_JSON = ('{"sentiment":"negative","categories":["버그오류"],'
            '"issue_summary":"요약.","keywords":["버그"]}')


def _api_error(cls, code: int, status: str, message: str):
    return cls(code, {"error": {"code": code, "status": status, "message": message}})


@pytest.fixture
def fresh_llm_state(monkeypatch):
    monkeypatch.setattr(clf, "_dead_models", set())
    monkeypatch.setattr("src.retry.time.sleep", lambda _s: None)
    clf.reset_llm_stats()
    return clf.llm_stats


@patch("src.processors.classifier._get_client")
def test_transient_server_error_is_retried(mock_get_client, fresh_llm_state):
    client = _mock_client(_OK_JSON)
    ok = client.models.generate_content.return_value
    client.models.generate_content.side_effect = [
        _api_error(genai_errors.ServerError, 503, "UNAVAILABLE", "overloaded"), ok,
    ]
    mock_get_client.return_value = client

    result = classify_post({"title": "버그 언제 고쳐요 진짜 너무하네요"})

    assert result["sentiment"] == "negative"
    assert fresh_llm_state.requests == 2 and fresh_llm_state.retries == 1
    assert fresh_llm_state.ok == 1 and fresh_llm_state.error_total == 0


@patch("src.processors.classifier._get_client")
def test_leaked_key_403_is_not_retried_and_counted_as_auth(mock_get_client, fresh_llm_state):
    """2026-07~09 운영 장애 재현: 유출 키 403은 재시도하지 않고 auth 오류로 집계(동작은 기존대로 None)."""
    client = MagicMock()
    client.models.generate_content.side_effect = _api_error(
        genai_errors.ClientError, 403, "PERMISSION_DENIED", "Your API key was reported as leaked.")
    mock_get_client.return_value = client

    assert classify_post({"title": "애매한 의견 글 제목입니다 테스트"}) is None
    assert client.models.generate_content.call_count == 1
    assert fresh_llm_state.errors == {"auth": 1}


@patch("src.processors.classifier._get_client")
def test_quota_exhausted_moves_through_chain_then_raises(mock_get_client, fresh_llm_state):
    client = MagicMock()
    client.models.generate_content.side_effect = _api_error(
        genai_errors.ClientError, 429, "RESOURCE_EXHAUSTED", "quota")
    mock_get_client.return_value = client

    with pytest.raises(clf.QuotaExhausted):
        classify_post({"title": "애매한 의견 글 제목입니다 테스트"})
    assert fresh_llm_state.errors["quota"] == len(clf._FALLBACK_MODELS)
    assert fresh_llm_state.retries == 0  # 쿼터 소진은 재시도 대상 아님


@patch("src.processors.classifier._get_client")
def test_latency_and_fallback_counters(mock_get_client, fresh_llm_state):
    mock_get_client.return_value = _mock_client(
        '{"sentiment":"angry","categories":["PvP"],"issue_summary":"","keywords":[]}')
    classify_post({"id": 1, "title": "애매한 의견 글 제목입니다 테스트"})
    assert fresh_llm_state.fallbacks == {"invalid_sentiment": 1, "category_filtered": 1}
    assert fresh_llm_state.avg_latency_ms is not None


# ── 묶음 분류 (batch 모드) ─────────────────────────────────────────────────────

def _queue_post(post_id: int, title: str) -> dict:
    return {
        "id": post_id, "source": "inven_aion2", "external_id": f"6388_{post_id}",
        "posted_at": "2026-11-08T10:00:00+09:00", "classified_at": None,
        "title": title, "category_tag": "잡담", "board_name": "자유",
    }


_BATCH_POSTS = [_queue_post(101, "망겜 ㅅㅂ"), _queue_post(102, "쟁탈전 존나잘만든듯"),
                _queue_post(103, "성역 매크로 어떻게 쓰나요?")]


@patch("src.processors.classifier._get_client")
def test_classify_batch_maps_results_to_post_ids(mock_get_client, fresh_llm_state):
    mock_get_client.return_value = _mock_client(
        '[{"id":1,"sentiment":"negative","categories":["커뮤니티"],"topic":"게임 전반 불만","keywords":["망겜"]},'
        ' {"id":2,"sentiment":"positive","categories":["콘텐츠"],"topic":"쟁탈전 호평","keywords":["쟁탈전"]},'
        ' {"id":3,"sentiment":"neutral","categories":["콘텐츠"],"topic":"성역 매크로 질문","keywords":["성역","매크로"]}]'
    )
    results = clf.classify_batch(_BATCH_POSTS, known_topics=["게임 이탈"])

    assert {k: v["sentiment"] for k, v in results.items()} == {101: "negative", 102: "positive", 103: "neutral"}
    assert results[102]["issue_summary"] == "쟁탈전 호평"  # topic이 issue_summary로 저장된다
    assert results[103]["keywords"] == ["성역", "매크로"]
    assert results[101]["model"] == clf._model_chain()[0]
    prompt = mock_get_client.return_value.models.generate_content.call_args.kwargs["contents"]
    assert "게임 이탈" in prompt and "쟁탈전 존나잘만든듯" in prompt
    assert fresh_llm_state.requests == 1 and fresh_llm_state.ok == 1


@patch("src.processors.classifier._get_client")
def test_classify_batch_missing_and_invalid_items(mock_get_client, fresh_llm_state):
    """응답에서 빠진 글은 결과에 없고(다음 실행 재시도), 잘못된 sentiment는 neutral로 폴백."""
    mock_get_client.return_value = _mock_client(
        '[{"id":1,"sentiment":"angry","categories":["없는카테고리"],"topic":"","keywords":[]},'
        ' {"id":99,"sentiment":"positive","categories":[],"topic":"x","keywords":[]}]'
    )
    results = clf.classify_batch(_BATCH_POSTS)

    assert list(results) == [101]
    assert results[101]["sentiment"] == "neutral"
    assert results[101]["categories"] == ["기타"]
    assert results[101]["issue_summary"] is None
    assert fresh_llm_state.fallbacks["invalid_sentiment"] == 1


@patch("src.processors.classifier._get_client")
def test_classify_batch_auth_error_raises_unavailable(mock_get_client, fresh_llm_state):
    client = MagicMock()
    client.models.generate_content.side_effect = _api_error(
        genai_errors.ClientError, 403, "PERMISSION_DENIED", "Your API key was reported as leaked.")
    mock_get_client.return_value = client

    with pytest.raises(clf.LLMUnavailable):
        clf.classify_batch(_BATCH_POSTS)
    assert fresh_llm_state.errors["auth"] == 1 and client.models.generate_content.call_count == 1


@patch("src.processors.classifier._get_client")
def test_classify_batch_quota_falls_back_to_next_model(mock_get_client, fresh_llm_state):
    ok = MagicMock()
    ok.text = '[{"id":1,"sentiment":"negative","categories":["기타"],"topic":"t","keywords":[]}]'
    client = MagicMock()
    client.models.generate_content.side_effect = [
        _api_error(genai_errors.ClientError, 429, "RESOURCE_EXHAUSTED", "quota"), ok,
    ]
    mock_get_client.return_value = client

    results = clf.classify_batch(_BATCH_POSTS[:1])

    models = [c.kwargs["model"] for c in client.models.generate_content.call_args_list]
    assert len(models) == 2 and models[0] != models[1]
    assert results[101]["model"] == models[1]
    assert models[0] in clf._dead_models


def test_quota_exhausted_is_llm_unavailable():
    assert issubclass(clf.QuotaExhausted, clf.LLMUnavailable)


def test_bulk_update_sends_identity_columns(mock_supabase):
    db = mock_supabase.return_value
    results = {101: {"sentiment": "negative", "categories": ["기타"], "issue_summary": "t",
                     "keywords": [], "model": "gemini-3.5-flash-lite"}}

    assert clf.bulk_update_classifications(_BATCH_POSTS, results) == 1

    payload = db.table.return_value.upsert.call_args.args[0]
    assert db.table.return_value.upsert.call_args.kwargs == {"on_conflict": "id"}
    assert len(payload) == 1
    row = payload[0]
    # INSERT 단계 NOT NULL 검사를 통과하도록 식별 컬럼을 같이 보낸다
    assert (row["id"], row["source"], row["external_id"]) == (101, "inven_aion2", "6388_101")
    assert row["classified_by_model"] == "gemini-3.5-flash-lite" and row["classified_at"]


def test_bulk_update_returns_zero_on_error(mock_supabase):
    mock_supabase.return_value.table.return_value.upsert.return_value.execute.side_effect = Exception("down")
    results = {101: {"sentiment": "negative", "categories": [], "issue_summary": None,
                     "keywords": [], "model": "m"}}
    assert clf.bulk_update_classifications(_BATCH_POSTS, results) == 0
    assert clf.bulk_update_classifications(_BATCH_POSTS, {}) == 0
