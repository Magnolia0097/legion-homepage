"""파이프라인 메인 진입점.

실행 순서:
1. 수집  — collect_inven_aion2 → save_posts (재시도·멱등 upsert)
2. 필터  — is_spam → mark_as_spam (sentiment='spam')
3. 분류  — batch 모드: classify_batch(50건씩 묶어 LLM) → bulk_update_classifications
           (그 외 모드: classify_hybrid / classify_post → update_classification)
4. 집계  — refresh_hourly_stats / refresh_daily_stats (이번에 분류된 글의 시간대·날짜 포함)
5. 기록  — 데이터 품질 체크 → pipeline_runs 기록 → 실행 요약($GITHUB_STEP_SUMMARY)

GitHub Actions(.github/workflows/pipeline.yml)에서 2시간마다 실행. 로컬:
    cd pipeline && uv run python scripts/run_pipeline.py

종료 코드: 0 정상(경고 포함) / 1 실행 중단 / 2 치명적 품질 경고 + PIPELINE_STRICT=1
"""

from __future__ import annotations

import logging
import os
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

# scripts/ 디렉토리에서 실행할 때 src 패키지를 찾기 위해 파이프라인 루트를 sys.path에 추가
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.aggregators.hourly import refresh_daily_stats, refresh_hourly_stats
from src.collectors import inven
from src.collectors.inven import collect_inven_aion2, save_posts
from src.config import Settings, get_settings
from src.db import (
    QUEUE_COLUMNS,
    fetch_recent_topics,
    fetch_unclassified,
    fetch_upgrade_candidates,
    mark_as_spam,
    reset_all_classifications,
)
from src.processors import classifier
from src.processors.classifier import (
    LLMUnavailable,
    QuotaExhausted,
    bulk_update_classifications,
    classify_batch,
    classify_post,
    update_classification,
)
from src.processors.filter import is_spam
from src.processors.hybrid import classify_hybrid
from src.processors.local_sentiment import classify_local
from src.processors.transformer_sentiment import classify_transformer
from src.quality import run_checks
from src.run_log import RunRecord, finish_run, new_record, start_run
from src.summary import publish

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

_CLASSIFY_SLEEP = 4.5  # gemini-2.5-flash-lite 무료 15 RPM → 4.5초 간격 (≈13 req/분)
_KST = timezone(timedelta(hours=9))
_FREE_BOARD = 6388  # 자유게시판 — 활동량이 많아 2페이지 수집


def _parse_ts(iso_str: str | None) -> datetime | None:
    try:
        return datetime.fromisoformat((iso_str or "").replace("Z", "+00:00"))
    except ValueError:
        return None


def _collect(run: RunRecord, settings: Settings) -> None:
    """1. 수집 — 게시판 하나가 실패해도 나머지는 계속.

    예전엔 '오늘(KST) 글'만 저장했다. 그러면 그날 마지막 실행 뒤~자정 사이에 올라온 글은
    다음 실행에서 '어제 글'이 돼 영원히 빠졌다. 날짜 파싱을 고쳤으니 본 글은 모두 저장하고
    중복은 (source, external_id) upsert가 막는다.
    """
    for board_id in settings.board_id_list:
        max_pages = 2 if board_id == _FREE_BOARD else 1
        try:
            posts = collect_inven_aion2(board_id=board_id, max_pages=max_pages)
            run.new_count += save_posts(posts)
            run.collected_count += len(posts)
        except Exception as exc:
            logger.error("board_id=%d 수집 실패: %s", board_id, exc)
            run.stage_errors.append(f"수집 board_id={board_id}: {type(exc).__name__}")
    logger.info("수집/저장: %d건 수집, %d건 신규 저장", run.collected_count, run.new_count)


def _classify_batch(run: RunRecord, settings: Settings) -> list[str]:
    """2~3. batch 모드 — 미분류 글, 예전 규칙으로 분류된 글 순으로 최신 글부터 LLM 묶음 분류.

    Returns:
        분류가 바뀐 글의 posted_at 목록 — 집계 단계에서 해당 시간대·날짜를 다시 센다.
    """
    started = time.monotonic()
    capacity = settings.llm_batch_size * settings.gemini_calls_per_run
    queue = fetch_unclassified(limit=capacity, columns=QUEUE_COLUMNS)
    fresh = len(queue)
    if fresh < capacity:
        queue += fetch_upgrade_candidates(limit=capacity - fresh)
    run.unclassified_count = len(queue)
    logger.info("분류 대기열: 미분류 %d건 + 재분류 %d건 (분류 모드: batch)", fresh, len(queue) - fresh)

    touched: list[str] = []
    candidates: list[dict] = []
    for post in queue:
        if is_spam(post):
            mark_as_spam(post["id"])
            run.spam_count += 1
            touched.append(post["posted_at"])
        else:
            candidates.append(post)

    known_topics = fetch_recent_topics() if candidates else []
    llm_available = True
    last_call: float | None = None
    done = 0
    while done < len(candidates):
        if time.monotonic() - started > settings.classify_time_budget:
            logger.warning("분류 시간 예산(%d초) 소진 — 남은 글은 다음 실행으로", settings.classify_time_budget)
            break
        batch = candidates[done:done + settings.llm_batch_size]
        if last_call is not None:
            wait = settings.llm_min_interval - (time.monotonic() - last_call)
            if wait > 0:
                time.sleep(wait)  # 무료 RPM 한도 대비
        last_call = time.monotonic()
        try:
            results = classify_batch(batch, known_topics)
        except LLMUnavailable as exc:
            logger.warning("LLM 사용 불가 — 이번 실행의 LLM 분류 중단: %s", exc)
            llm_available = False
            break
        done += len(batch)
        saved = bulk_update_classifications(batch, results)
        run.classified_count += saved
        run.failed_count += len(batch) - saved  # 응답 누락·저장 실패 → 다음 실행에서 재시도
        if saved:
            touched += [p["posted_at"] for p in batch if p["id"] in results]
        for result in results.values():  # 같은 실행 안에서도 topic 문자열을 맞추도록 누적
            topic = result.get("issue_summary")
            if topic and topic not in known_topics and len(known_topics) < 40:
                known_topics.append(topic)

    remaining = candidates[done:]
    if not llm_available and remaining:
        # LLM을 못 쓰면 최근 미분류 글만 키워드로 임시 분류해 대시보드가 멈추지 않게 한다.
        # model='local-keyword'라 나중에 LLM이 돌아오면 재분류 대기열로 다시 들어간다.
        cutoff = datetime.now(tz=timezone.utc) - timedelta(hours=settings.keyword_fallback_hours)
        fallback = [
            p for p in remaining
            if p.get("classified_at") is None and (_parse_ts(p["posted_at"]) or cutoff) >= cutoff
        ]
        results = {p["id"]: {**classify_local(p), "issue_summary": None} for p in fallback}
        saved = bulk_update_classifications(fallback, results)
        run.classified_count += saved
        if saved:
            touched += [p["posted_at"] for p in fallback]
            remaining = [p for p in remaining if p["id"] not in results]
        logger.info("키워드 임시 분류: %d건 (최근 %d시간 미분류 글)", saved, settings.keyword_fallback_hours)
    run.deferred_count += len(remaining)

    logger.info(
        "처리 완료 — 스팸: %d건, 분류 성공: %d건, 보류: %d건, 실패: %d건 "
        "(LLM 요청 %d · 성공 %d · 오류 %s)",
        run.spam_count, run.classified_count, run.deferred_count, run.failed_count,
        classifier.llm_stats.requests, classifier.llm_stats.ok,
        dict(classifier.llm_stats.errors) or "없음",
    )
    return touched


def _classify(run: RunRecord, settings: Settings) -> list[str]:
    """2~3. 필터 + 분류. 분류가 바뀐 글의 posted_at 목록을 돌려준다 (batch 모드만)."""
    if settings.classifier_mode == "batch":
        return _classify_batch(run, settings)

    # transformer/local 모드는 무료·무제한이라 한 번에 많이, gemini 모드는 무료 한도 고려해 소량
    mode = settings.classifier_mode
    fetch_limit = 80 if mode == "gemini" else 1000
    unclassified = fetch_unclassified(limit=fetch_limit)
    run.unclassified_count = len(unclassified)
    logger.info("미분류 게시글: %d건 (분류 모드: %s)", len(unclassified), mode)

    gemini_calls = 0  # 이번 실행에서 Gemini 예산을 쓴 글 수 (성공·실패 무관)
    gemini_budget = settings.gemini_calls_per_run  # 실행당 Gemini 호출 상한
    gemini_dead = False  # 쿼터 소진되면 True → 이후엔 무료 경로만

    for post in unclassified:
        post_id = post["id"]

        # ── 필터 (Tier-1) ──
        if is_spam(post):
            mark_as_spam(post_id)
            run.spam_count += 1
            continue

        # ── 분류 (Tier-2) ──
        api_called = False
        if mode == "hybrid":
            # 질문/명백한 글은 무료 키워드, 애매한 의견글만 Gemini (예산 안에서)
            use_gemini = (not gemini_dead) and gemini_budget > 0
            try:
                result, api_called = classify_hybrid(post, use_gemini)
            except QuotaExhausted:
                logger.warning("Gemini 쿼터 소진 — 이후 무료 경로로 전환 (LLM %d건 호출)", gemini_calls)
                gemini_dead = True
                result, api_called = classify_hybrid(post, use_gemini=False)
            if api_called:
                gemini_budget -= 1
                gemini_calls += 1
            if result is None:
                # 애매한데 예산 없음 → 보류. 다음 실행에서 Gemini로 재시도.
                run.deferred_count += 1
                continue
        elif mode == "transformer":
            # 로컬 감성 트랜스포머 — API 호출 없음, 한도·지연 없음 (맥락 이해)
            result = classify_transformer(post)
        elif mode == "local":
            # 로컬 키워드 분류 — API 호출 없음, 한도·지연 없음
            result = classify_local(post)
        else:
            api_called = True
            try:
                result = classify_post(post)
            except QuotaExhausted:
                logger.warning("Gemini 쿼터 소진 — 이번 배치 분류 중단 (분류 성공 %d건 후 종료)",
                               run.classified_count)
                break

        if result is None:
            run.failed_count += 1
            continue

        if update_classification(post_id, result):
            run.classified_count += 1
        else:
            run.failed_count += 1  # DB 저장 실패 — classified_at이 비어 다음 실행에서 재시도됨
        # Gemini를 실제로 부른 경우에만 RPM 제한 대비 슬립
        if api_called:
            time.sleep(_CLASSIFY_SLEEP)

    logger.info(
        "처리 완료 — 스팸: %d건, 분류 성공: %d건, 보류: %d건, 실패: %d건 "
        "(Gemini 호출 글 %d건: 요청 %d · 성공 %d · 오류 %s)",
        run.spam_count, run.classified_count, run.deferred_count, run.failed_count,
        gemini_calls, classifier.llm_stats.requests, classifier.llm_stats.ok,
        dict(classifier.llm_stats.errors) or "없음",
    )
    return []


def _aggregate(run: RunRecord, touched: list[str] | None = None) -> None:
    """4. 집계 갱신 — 최근 구간 + 이번에 분류가 바뀐 글의 시간대·날짜."""
    stamps = [ts for ts in (_parse_ts(s) for s in touched or []) if ts is not None]
    try:
        run.hourly_buckets = refresh_hourly_stats(hours_back=24, hours=stamps)
        run.daily_buckets = refresh_daily_stats(days_back=2, days=stamps)
        logger.info("집계: hourly %d개 시간대, daily %d개 일자", run.hourly_buckets, run.daily_buckets)
    except Exception as exc:
        logger.error("집계 단계 실패: %s", exc)
        run.stage_errors.append(f"집계: {type(exc).__name__}")


def _absorb_stats(run: RunRecord) -> None:
    """모듈별 호출 지표를 실행 기록으로 옮긴다."""
    cs, ls = inven.crawl_stats, classifier.llm_stats
    run.pages_failed, run.crawl_retries, run.date_fallbacks = cs.pages_failed, cs.retries, cs.date_fallbacks
    run.llm_requests, run.llm_ok, run.llm_retries = ls.requests, ls.ok, ls.retries
    run.llm_errors = dict(ls.errors)
    run.llm_avg_latency_ms = ls.avg_latency_ms
    run.fallback_count = sum(ls.fallbacks.values())


def main() -> int:
    logger.info("=== 파이프라인 시작 ===")
    settings = get_settings()
    run = new_record(settings.classifier_mode, settings.gemini_model)
    inven.reset_crawl_stats()
    classifier.reset_llm_stats()
    start_run(run)

    crashed: BaseException | None = None
    try:
        # ── 0. (선택) 전체 재분류 — RESET_CLASSIFICATIONS=1 일 때만 ──
        # 분류 기준을 바꾼 뒤 기존 데이터까지 새 기준으로 다시 매기고 싶을 때 사용.
        if os.environ.get("RESET_CLASSIFICATIONS", "").strip().lower() in ("1", "true", "yes"):
            logger.info("RESET_CLASSIFICATIONS=on → 기존 분류 초기화 후 재분류")
            reset_all_classifications()
        _collect(run, settings)
        touched = _classify(run, settings)
        _aggregate(run, touched)
    except Exception as exc:  # 예상 못 한 예외도 실행 기록·요약은 남긴다
        crashed = exc
        logger.exception("파이프라인 중단")
    finally:
        _absorb_stats(run)
        run.finish(crashed=crashed)
        findings = run_checks(run)
        run.dq_warnings = [str(f) for f in findings]
        finish_run(run)
        publish(run, findings)

    logger.info(
        "=== 파이프라인 종료 [%s] (수집 %d건 / 스팸 %d / 분류 %d / 보류 %d / 실패 %d / 품질 경고 %d) ===",
        run.status, run.new_count, run.spam_count, run.classified_count,
        run.deferred_count, run.failed_count, len(findings),
    )
    if crashed is not None:
        return 1
    strict = os.environ.get("PIPELINE_STRICT", "").strip().lower() in ("1", "true", "yes")
    if strict and any(f.level == "critical" for f in findings):
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
