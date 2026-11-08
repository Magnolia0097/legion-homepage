"""관측성 모듈 테스트 — 실행 기록(run_log), 데이터 품질(quality), 실행 요약(summary)."""

from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest

from src import quality, run_log, summary
from src.quality import Finding, Metrics, Thresholds, evaluate
from src.run_log import RunRecord, new_record


def _run(**kw) -> RunRecord:
    r = RunRecord(run_id="t", trigger="local", git_sha=None, classifier_mode="hybrid",
                  model="gemini-2.5-flash-lite")
    for k, v in kw.items():
        setattr(r, k, v)
    return r


def _codes(findings: list[Finding]) -> set[str]:
    return {f.code for f in findings}


# ── 데이터 품질 판정 ──────────────────────────────────────────────────────────

def test_healthy_run_has_no_findings():
    m = Metrics(window_rows=500, null_counts={"title": 0, "url": 0},
                neutral_recent=(40, 100), neutral_baseline=(280, 700), backlog=20)
    assert evaluate(m, _run(llm_requests=12, llm_ok=12)) == []


def test_leaked_key_incident_is_flagged_critical():
    """07~09월 장애 재현: Gemini 12건 요청 전부 403 → 치명 경고 2종."""
    findings = evaluate(Metrics(), _run(llm_requests=12, llm_ok=0, llm_errors={"auth": 12}))
    assert {"llm_auth", "llm_all_failed"} <= _codes(findings)
    assert all(f.level == "critical" for f in findings if f.code.startswith("llm_"))


def test_neutral_shift_detected_only_with_enough_samples():
    th = Thresholds(neutral_shift=0.15, min_posts_for_ratio=30)
    shifted = Metrics(neutral_recent=(70, 100), neutral_baseline=(280, 700))  # 70% vs 40%
    assert "neutral_shift" in _codes(evaluate(shifted, _run(), th))
    small = Metrics(neutral_recent=(9, 10), neutral_baseline=(280, 700))      # 표본 10건
    assert "neutral_shift" not in _codes(evaluate(small, _run(), th))
    stable = Metrics(neutral_recent=(45, 100), neutral_baseline=(280, 700))   # 45% vs 40%
    assert "neutral_shift" not in _codes(evaluate(stable, _run(), th))


def test_table_level_findings():
    m = Metrics(window_rows=100, null_counts={"title": 0, "board_name": 3},
                duplicate_keys=2, future_posted_at=1, backlog=964)
    codes = _codes(evaluate(m, _run(pages_failed=2, date_fallbacks=27)))
    assert codes == {"null_board_name", "duplicate_keys", "future_posted_at", "backlog",
                     "crawl_pages_failed", "date_parse_fallback"}


def test_collect_metrics_computes_from_rows():
    now = datetime(2026, 10, 14, 3, 0, tzinfo=timezone.utc)
    rows = [
        {"id": 1, "source": "inven_aion2", "external_id": "6388_1", "title": "a", "url": "u",
         "posted_at": "2026-10-14T02:00:00+00:00", "board_name": "자유"},
        {"id": 2, "source": "inven_aion2", "external_id": "6388_1", "title": "", "url": "u",
         "posted_at": "2026-10-14T05:00:00+00:00", "board_name": None},  # 중복·제목 없음·미래·보드 없음
    ]
    db = MagicMock()
    q = db.table.return_value.select.return_value
    # 행 조회 체인: gte → gt → order → limit → execute
    q.gte.return_value.gt.return_value.order.return_value.limit.return_value.execute.return_value.data = rows
    with patch("src.quality.get_supabase", return_value=db), \
         patch("src.quality._neutral_pair", side_effect=[(40, 100), (280, 700)]), \
         patch("src.quality._count", return_value=964):
        m = quality.collect_metrics(now=now)
    assert m.window_rows == 2
    assert m.null_counts == {"title": 1, "url": 0, "posted_at": 0, "board_name": 1}
    assert m.duplicate_keys == 1 and m.future_posted_at == 1
    assert (m.neutral_recent, m.neutral_baseline, m.backlog) == ((40, 100), (280, 700), 964)


def test_run_checks_survives_db_failure():
    with patch("src.quality.collect_metrics", side_effect=RuntimeError("timeout")):
        findings = quality.run_checks(_run(llm_requests=3, llm_ok=0))
    assert "llm_all_failed" in _codes(findings)  # 실행 지표 기반 경고는 여전히 나온다


# ── 실행 기록 ─────────────────────────────────────────────────────────────────

def test_status_success_partial_failed():
    r = _run()
    r.finish()
    assert r.status == "success"
    r = _run(llm_errors={"quota": 3})  # 무료 티어 쿼터 소진은 오류로 보지 않음
    r.finish()
    assert r.status == "success"
    r = _run(pages_failed=1)
    r.finish()
    assert r.status == "partial" and r.error_count == 1
    r = _run()
    r.finish(crashed=ValueError("boom"))
    assert r.status == "failed" and r.error_message == "ValueError: boom"


def test_to_row_matches_migration_columns():
    """pipeline_runs에 없는 필드는 빼고 보낸다 — 005 마이그레이션 컬럼과 일치."""
    import re
    from pathlib import Path

    sql = (Path(__file__).parents[2] / "supabase/migrations/005_pipeline_runs.sql").read_text()
    body = sql[sql.index("CREATE TABLE"):sql.index(");")]
    columns = set(re.findall(r"^\s{4}(\w+)\s+[A-Z]", body, flags=re.M))
    assert set(_run().to_row()) == columns


def test_new_record_uses_github_env(monkeypatch):
    monkeypatch.setenv("GITHUB_RUN_ID", "123")
    monkeypatch.setenv("GITHUB_RUN_ATTEMPT", "2")
    monkeypatch.setenv("GITHUB_EVENT_NAME", "schedule")
    monkeypatch.setenv("GITHUB_SHA", "abc")
    r = new_record("hybrid", "m")
    assert (r.run_id, r.trigger, r.git_sha) == ("gh-123-2", "schedule", "abc")


def test_missing_table_warns_once_and_stops_writing(monkeypatch, caplog):
    monkeypatch.setattr(run_log, "_table_missing", False)
    db = MagicMock()
    db.table.return_value.insert.return_value.execute.side_effect = Exception(
        "{'code': 'PGRST205', 'message': \"Could not find the table 'public.pipeline_runs'\"}")
    with patch("src.run_log.get_supabase", return_value=db):
        run_log.start_run(_run())
        run_log.finish_run(_run())
    assert run_log._table_missing is True
    assert db.table.return_value.update.call_count == 0
    assert sum("005 마이그레이션" in m for m in caplog.messages) == 1


# ── 실행 요약 ─────────────────────────────────────────────────────────────────

def test_summary_markdown_and_annotations(tmp_path, monkeypatch, capsys):
    out = tmp_path / "summary.md"
    monkeypatch.setenv("GITHUB_STEP_SUMMARY", str(out))
    monkeypatch.setenv("GITHUB_ACTIONS", "true")
    r = _run(new_count=51, classified_count=18, deferred_count=974,
             llm_requests=5, llm_ok=0, llm_errors={"auth": 5})
    r.finish()
    findings = [Finding("critical", "llm_auth", "Gemini 인증 오류 5건")]

    summary.publish(r, findings)

    md = out.read_text(encoding="utf-8")
    assert "⚠️ 파이프라인 실행 요약" in md            # 오류가 있으니 partial
    assert "| 분류 | 분류 / 스팸 / 보류 / 실패 | 18 / 0 / 974 / 0 |" in md
    assert "auth 5" in md and "🚨 Gemini 인증 오류 5건" in md
    assert "::error title=데이터 품질 (llm_auth)::Gemini 인증 오류 5건" in capsys.readouterr().out


def test_summary_noop_outside_actions(monkeypatch, capsys):
    monkeypatch.delenv("GITHUB_STEP_SUMMARY", raising=False)
    monkeypatch.delenv("GITHUB_ACTIONS", raising=False)
    summary.publish(_run(), [Finding("warning", "x", "y")])
    assert capsys.readouterr().out == ""


@pytest.mark.parametrize("pair,expected", [((0, 0), None), ((1, 4), 0.25), (None, None)])
def test_ratio(pair, expected):
    assert quality._ratio(pair) == expected
