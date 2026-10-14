"""run_pipeline.main() 통합 테스트 — 모든 외부 호출 mock.

분류 모드별로 검증한다:
- gemini 모드: 모든 글을 LLM으로 분류 (원래 테스트 의도 유지)
- hybrid 모드(운영 기본값): 예산 차감·보류(deferred)·쿼터 소진 시 무료 경로 전환
"""

from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import pytest

# sys.path 조작이 run_pipeline.py 임포트 시 실행되므로, 직접 함수만 import
from scripts.run_pipeline import main
from src.config import get_settings
from src.processors.classifier import QuotaExhausted


_KST = timezone(timedelta(hours=9))

# ── 헬퍼 ─────────────────────────────────────────────────────────────────────

def _make_post(post_id: int, title: str = "아이온2 관련 정상 게시글 제목입니다") -> dict:
    return {"id": post_id, "title": title, "body": None}


_RESULT = {
    "sentiment": "positive",
    "categories": ["클래스밸런스"],
    "issue_summary": "테스트 요약.",
    "keywords": ["테스트"],
    "model": "gemini-2.5-flash-lite",
}


@pytest.fixture
def settings(monkeypatch):
    """main()이 보는 Settings를 테스트별로 바꾼다 (기본: 자유게시판 1개)."""

    def _apply(**overrides):
        base = get_settings().model_copy(update={"inven_board_ids": "6388", **overrides})
        monkeypatch.setattr("scripts.run_pipeline.get_settings", lambda: base)
        return base

    return _apply


@pytest.fixture(autouse=True)
def recorded():
    """집계·실행 기록·품질 체크·요약의 DB/파일 접근 차단. finish_run에 넘어간 기록을 돌려준다."""
    with patch("scripts.run_pipeline.refresh_hourly_stats", return_value=0), \
         patch("scripts.run_pipeline.refresh_daily_stats", return_value=0), \
         patch("scripts.run_pipeline.start_run"), \
         patch("scripts.run_pipeline.finish_run") as finish, \
         patch("scripts.run_pipeline.run_checks", return_value=[]) as checks, \
         patch("scripts.run_pipeline.publish"):
        yield {"finish": finish, "checks": checks}


# ── gemini 모드: 정상 흐름 ────────────────────────────────────────────────────

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
    mock_mark_spam, mock_classify, mock_update, mock_sleep, settings,
):
    """정상 흐름: 수집 → 필터 통과 → 분류 성공."""
    settings(classifier_mode="gemini")
    posts = [_make_post(1), _make_post(2)]
    mock_collect.return_value = posts
    mock_fetch.return_value = posts
    mock_classify.return_value = _RESULT

    main()

    # 자유게시판(6388)은 활동량이 많아 2페이지 수집
    mock_collect.assert_called_once_with(board_id=6388, max_pages=2)
    mock_fetch.assert_called_once_with(limit=80)  # gemini 모드는 무료 한도 고려해 소량
    assert mock_classify.call_count == 2
    assert mock_update.call_count == 2
    assert mock_sleep.call_count == 2  # LLM 호출마다 RPM 대비 슬립


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
    mock_mark_spam, mock_classify, mock_update, mock_sleep, settings,
):
    """모든 게시글이 스팸인 경우 — classify_post 호출 없음."""
    settings(classifier_mode="gemini")
    mock_fetch.return_value = [_make_post(1), _make_post(2)]

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
    mock_mark_spam, mock_classify, mock_update, mock_sleep, settings,
):
    """수집 단계 예외 → 필터·분류 단계는 계속 실행 (graceful degradation)."""
    settings(inven_board_ids="6388,6438")
    mock_collect.side_effect = Exception("네트워크 오류")

    main()  # 예외 없이 완료돼야 함

    assert mock_collect.call_count == 2  # 한 게시판 실패가 다음 게시판 수집을 막지 않음
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
    mock_mark_spam, mock_classify, mock_update, mock_sleep, settings,
):
    """gemini 모드에서 분류 실패(None) → update_classification 미호출, sleep 미호출."""
    settings(classifier_mode="gemini")
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
    mock_mark_spam, mock_classify, mock_update, mock_sleep, settings,
):
    """미분류 게시글 없음 → 필터·분류 루프 실행 안 함."""
    settings()
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
    mock_mark_spam, mock_classify, mock_update, mock_sleep, settings,
):
    """스팸 1건 + 정상 1건 혼합 → 스팸은 mark_as_spam, 정상은 classify_post."""
    settings(classifier_mode="gemini")
    posts = [_make_post(1, "판매문의"), _make_post(2, "글라디에이터 상향 너무 좋아요")]
    mock_collect.return_value = posts
    mock_fetch.return_value = posts
    mock_is_spam.side_effect = [True, False]
    mock_classify.return_value = _RESULT

    main()

    mock_mark_spam.assert_called_once_with(1)
    mock_classify.assert_called_once_with(posts[1])
    mock_update.assert_called_once_with(2, _RESULT)
    mock_sleep.assert_called_once()


# ── hybrid 모드 (운영 기본값) ─────────────────────────────────────────────────

@patch("scripts.run_pipeline.time.sleep")
@patch("scripts.run_pipeline.update_classification")
@patch("scripts.run_pipeline.classify_hybrid")
@patch("scripts.run_pipeline.mark_as_spam")
@patch("scripts.run_pipeline.is_spam", return_value=False)
@patch("scripts.run_pipeline.fetch_unclassified")
@patch("scripts.run_pipeline.save_posts", return_value=0)
@patch("scripts.run_pipeline.collect_inven_aion2", return_value=[])
def test_hybrid_budget_exhausted_defers_ambiguous_posts(
    mock_collect, mock_save, mock_fetch, mock_is_spam,
    mock_mark_spam, mock_hybrid, mock_update, mock_sleep, settings,
):
    """실행당 Gemini 예산을 다 쓰면 이후 글은 use_gemini=False로 분류 → 보류는 저장 안 함."""
    settings(classifier_mode="hybrid", gemini_calls_per_run=1)
    posts = [_make_post(1), _make_post(2)]
    mock_fetch.return_value = posts
    # 1번 글: Gemini 호출해서 분류 / 2번 글: 예산 없음 → 보류(None)
    mock_hybrid.side_effect = [(_RESULT, True), (None, False)]

    main()

    mock_fetch.assert_called_once_with(limit=1000)
    assert [c.args[1] for c in mock_hybrid.call_args_list] == [True, False]
    mock_update.assert_called_once_with(1, _RESULT)  # 보류된 2번 글은 저장 안 함
    mock_sleep.assert_called_once()  # API를 실제로 부른 1건만 슬립


@patch("scripts.run_pipeline.time.sleep")
@patch("scripts.run_pipeline.update_classification")
@patch("scripts.run_pipeline.classify_hybrid")
@patch("scripts.run_pipeline.mark_as_spam")
@patch("scripts.run_pipeline.is_spam", return_value=False)
@patch("scripts.run_pipeline.fetch_unclassified")
@patch("scripts.run_pipeline.save_posts", return_value=0)
@patch("scripts.run_pipeline.collect_inven_aion2", return_value=[])
def test_hybrid_quota_exhausted_switches_to_free_path(
    mock_collect, mock_save, mock_fetch, mock_is_spam,
    mock_mark_spam, mock_hybrid, mock_update, mock_sleep, settings,
):
    """쿼터 소진 예외 → 같은 글을 무료 경로로 재시도하고, 이후 글도 Gemini를 쓰지 않음."""
    settings(classifier_mode="hybrid", gemini_calls_per_run=12)
    posts = [_make_post(1), _make_post(2)]
    mock_fetch.return_value = posts
    local = {**_RESULT, "model": "local-keyword"}
    mock_hybrid.side_effect = [QuotaExhausted("429"), (local, False), (local, False)]

    main()

    use_gemini_flags = [
        c.kwargs["use_gemini"] if "use_gemini" in c.kwargs else c.args[1]
        for c in mock_hybrid.call_args_list
    ]
    assert use_gemini_flags == [True, False, False]
    assert mock_update.call_count == 2
    mock_sleep.assert_not_called()


# ── 실행 기록·종료 코드 ───────────────────────────────────────────────────────

@patch("scripts.run_pipeline.time.sleep")
@patch("scripts.run_pipeline.update_classification", side_effect=[True, False])
@patch("scripts.run_pipeline.classify_hybrid")
@patch("scripts.run_pipeline.mark_as_spam")
@patch("scripts.run_pipeline.is_spam", side_effect=[True, False, False, False])
@patch("scripts.run_pipeline.fetch_unclassified")
@patch("scripts.run_pipeline.save_posts", return_value=3)
@patch("scripts.run_pipeline.collect_inven_aion2")
def test_run_record_counts(
    mock_collect, mock_save, mock_fetch, mock_is_spam,
    mock_mark_spam, mock_hybrid, mock_update, mock_sleep, settings, recorded,
):
    """pipeline_runs에 남는 건수가 실제 처리 결과와 일치 — DB 저장 실패는 분류 성공으로 세지 않음."""
    settings(classifier_mode="hybrid")
    mock_collect.return_value = [{"posted_at": datetime.now(tz=_KST).isoformat()}] * 4
    mock_fetch.return_value = [_make_post(i) for i in range(1, 5)]
    mock_hybrid.side_effect = [(_RESULT, False), (_RESULT, False), (None, False)]

    assert main() == 0

    run = recorded["finish"].call_args.args[0]
    assert (run.collected_count, run.new_count) == (4, 3)
    assert (run.unclassified_count, run.spam_count) == (4, 1)
    assert (run.classified_count, run.failed_count, run.deferred_count) == (1, 1, 1)
    assert run.status == "success" and run.finished_at is not None


@patch("scripts.run_pipeline.fetch_unclassified", side_effect=RuntimeError("DB down"))
@patch("scripts.run_pipeline.save_posts", return_value=0)
@patch("scripts.run_pipeline.collect_inven_aion2", return_value=[])
def test_unexpected_crash_is_recorded_and_exits_1(mock_collect, mock_save, mock_fetch, settings, recorded):
    settings()
    assert main() == 1
    run = recorded["finish"].call_args.args[0]
    assert run.status == "failed"
    assert "DB down" in run.error_message
    recorded["checks"].assert_called_once()  # 중단돼도 품질 체크·요약은 실행


@patch("scripts.run_pipeline.fetch_unclassified", return_value=[])
@patch("scripts.run_pipeline.save_posts", return_value=0)
@patch("scripts.run_pipeline.collect_inven_aion2", return_value=[])
def test_strict_mode_fails_on_critical_finding(mock_collect, mock_save, mock_fetch,
                                               settings, recorded, monkeypatch):
    from src.quality import Finding

    settings()
    recorded["checks"].return_value = [Finding("critical", "llm_auth", "인증 오류")]
    assert main() == 0  # 기본: 경고만
    monkeypatch.setenv("PIPELINE_STRICT", "1")
    assert main() == 2  # strict: 치명 경고면 실패 → Actions 실패 알림
