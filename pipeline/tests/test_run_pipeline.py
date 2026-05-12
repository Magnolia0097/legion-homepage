"""run_pipeline.main() 통합 테스트 — 모든 외부 호출 mock."""

from unittest.mock import MagicMock, call, patch

import pytest

# sys.path 조작이 run_pipeline.py 임포트 시 실행되므로, 직접 함수만 import
from scripts.run_pipeline import main


# ── 헬퍼 ─────────────────────────────────────────────────────────────────────

def _make_post(post_id: int, title: str = "아이온2 관련 정상 게시글 제목입니다") -> dict:
    return {"id": post_id, "title": title, "body": None}


# ── 정상 흐름 ─────────────────────────────────────────────────────────────────

@patch("scripts.run_pipeline.time.sleep")
@patch("scripts.run_pipeline.update_classification")
@patch("scripts.run_pipeline.classify_post")
@patch("scripts.run_pipeline.mark_as_spam")
@patch("scripts.run_pipeline.is_spam", return_value=False)
@patch("scripts.run_pipeline.fetch_unclassified")
@patch("scripts.run_pipeline.save_posts", return_value=2)
@patch("scripts.run_pipeline.collect_inven_aion2")
def test_happy_path(
    mock_collect, mock_save, mock_fetch, mock_is_spam,
    mock_mark_spam, mock_classify, mock_update, mock_sleep,
):
    """정상 흐름: 수집 → 필터 통과 → 분류 성공."""
    posts = [_make_post(1), _make_post(2)]
    mock_collect.return_value = posts
    mock_fetch.return_value = posts
    mock_classify.return_value = {
        "sentiment": "positive",
        "categories": ["클래스밸런스"],
        "issue_summary": "테스트 요약.",
        "keywords": ["테스트"],
    }

    main()

    mock_collect.assert_called_once_with(board_id=6388, max_pages=1)
    mock_save.assert_called_once_with(posts)
    mock_fetch.assert_called_once_with(limit=50)
    assert mock_classify.call_count == 2
    assert mock_update.call_count == 2
    assert mock_sleep.call_count == 2


@patch("scripts.run_pipeline.time.sleep")
@patch("scripts.run_pipeline.update_classification")
@patch("scripts.run_pipeline.classify_post")
@patch("scripts.run_pipeline.mark_as_spam")
@patch("scripts.run_pipeline.is_spam", return_value=True)
@patch("scripts.run_pipeline.fetch_unclassified")
@patch("scripts.run_pipeline.save_posts", return_value=0)
@patch("scripts.run_pipeline.collect_inven_aion2", return_value=[])
def test_all_spam(
    mock_collect, mock_save, mock_fetch, mock_is_spam,
    mock_mark_spam, mock_classify, mock_update, mock_sleep,
):
    """모든 게시글이 스팸인 경우 — classify_post 호출 없음."""
    posts = [_make_post(1), _make_post(2)]
    mock_fetch.return_value = posts

    main()

    assert mock_mark_spam.call_count == 2
    mock_classify.assert_not_called()
    mock_update.assert_not_called()
    mock_sleep.assert_not_called()


# ── 단계별 실패 시나리오 ──────────────────────────────────────────────────────

@patch("scripts.run_pipeline.time.sleep")
@patch("scripts.run_pipeline.update_classification")
@patch("scripts.run_pipeline.classify_post")
@patch("scripts.run_pipeline.mark_as_spam")
@patch("scripts.run_pipeline.is_spam", return_value=False)
@patch("scripts.run_pipeline.fetch_unclassified", return_value=[])
@patch("scripts.run_pipeline.save_posts", return_value=0)
@patch("scripts.run_pipeline.collect_inven_aion2")
def test_collect_raises_continues(
    mock_collect, mock_save, mock_fetch, mock_is_spam,
    mock_mark_spam, mock_classify, mock_update, mock_sleep,
):
    """수집 단계 예외 → 필터·분류 단계는 계속 실행 (graceful degradation)."""
    mock_collect.side_effect = Exception("네트워크 오류")

    main()  # 예외 없이 완료돼야 함

    mock_fetch.assert_called_once()  # 수집 실패해도 미분류 처리 시도


@patch("scripts.run_pipeline.time.sleep")
@patch("scripts.run_pipeline.update_classification")
@patch("scripts.run_pipeline.classify_post", return_value=None)
@patch("scripts.run_pipeline.mark_as_spam")
@patch("scripts.run_pipeline.is_spam", return_value=False)
@patch("scripts.run_pipeline.fetch_unclassified")
@patch("scripts.run_pipeline.save_posts", return_value=1)
@patch("scripts.run_pipeline.collect_inven_aion2")
def test_classify_returns_none_counted_as_failed(
    mock_collect, mock_save, mock_fetch, mock_is_spam,
    mock_mark_spam, mock_classify, mock_update, mock_sleep,
):
    """Gemini 분류 실패(None 반환) → update_classification 미호출, sleep 미호출."""
    posts = [_make_post(1)]
    mock_collect.return_value = posts
    mock_fetch.return_value = posts

    main()

    mock_update.assert_not_called()
    mock_sleep.assert_not_called()


@patch("scripts.run_pipeline.time.sleep")
@patch("scripts.run_pipeline.update_classification")
@patch("scripts.run_pipeline.classify_post")
@patch("scripts.run_pipeline.mark_as_spam")
@patch("scripts.run_pipeline.is_spam")
@patch("scripts.run_pipeline.fetch_unclassified", return_value=[])
@patch("scripts.run_pipeline.save_posts", return_value=0)
@patch("scripts.run_pipeline.collect_inven_aion2", return_value=[])
def test_no_unclassified_posts(
    mock_collect, mock_save, mock_fetch, mock_is_spam,
    mock_mark_spam, mock_classify, mock_update, mock_sleep,
):
    """미분류 게시글 없음 → 필터·분류 루프 실행 안 함."""
    main()

    mock_is_spam.assert_not_called()
    mock_classify.assert_not_called()


# ── 호출 순서 검증 ─────────────────────────────────────────────────────────────

@patch("scripts.run_pipeline.time.sleep")
@patch("scripts.run_pipeline.update_classification")
@patch("scripts.run_pipeline.classify_post")
@patch("scripts.run_pipeline.mark_as_spam")
@patch("scripts.run_pipeline.is_spam")
@patch("scripts.run_pipeline.fetch_unclassified")
@patch("scripts.run_pipeline.save_posts", return_value=1)
@patch("scripts.run_pipeline.collect_inven_aion2")
def test_mixed_spam_and_valid(
    mock_collect, mock_save, mock_fetch, mock_is_spam,
    mock_mark_spam, mock_classify, mock_update, mock_sleep,
):
    """스팸 1건 + 정상 1건 혼합 → 스팸은 mark_as_spam, 정상은 classify_post."""
    posts = [_make_post(1, "판매문의"), _make_post(2, "글라디에이터 상향 너무 좋아요")]
    mock_collect.return_value = posts
    mock_fetch.return_value = posts
    mock_is_spam.side_effect = [True, False]
    mock_classify.return_value = {
        "sentiment": "positive",
        "categories": ["클래스밸런스"],
        "issue_summary": "상향 패치 긍정 반응.",
        "keywords": ["글라디에이터"],
    }

    main()

    mock_mark_spam.assert_called_once_with(1)
    mock_classify.assert_called_once_with(posts[1])
    mock_update.assert_called_once_with(2, mock_classify.return_value)
    mock_sleep.assert_called_once()
