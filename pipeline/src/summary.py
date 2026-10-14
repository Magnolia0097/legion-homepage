"""실행 요약 — GitHub Actions 실행 페이지($GITHUB_STEP_SUMMARY)에 표로 남긴다.

로그를 열지 않아도 실행 결과(건수·LLM 상태·품질 경고)가 실행 목록 화면에서 바로 보이게 하는 것이 목적.
품질 경고는 ::warning:: 어노테이션으로도 출력해 실행 목록에 노란 표시가 뜨게 한다.
"""

from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone

from .quality import Finding
from .run_log import RunRecord

_KST = timezone(timedelta(hours=9))
_STATUS_ICON = {"success": "✅", "partial": "⚠️", "failed": "❌", "running": "⏳"}


def _kst(iso: str | None) -> str:
    if not iso:
        return "-"
    return datetime.fromisoformat(iso).astimezone(_KST).strftime("%Y-%m-%d %H:%M KST")


def render_markdown(run: RunRecord, findings: list[Finding]) -> str:
    errors = ", ".join(f"{k} {v}" for k, v in sorted(run.llm_errors.items())) or "없음"
    latency = f"{run.llm_avg_latency_ms:.0f} ms" if run.llm_avg_latency_ms is not None else "-"
    lines = [
        f"## {_STATUS_ICON.get(run.status, '')} 파이프라인 실행 요약 — {_kst(run.started_at)}",
        "",
        f"`{run.run_id}` · 상태 **{run.status}** · 모드 `{run.classifier_mode}` · 모델 `{run.model}`",
        "",
        "| 단계 | 지표 | 값 |",
        "|---|---|---:|",
        f"| 수집 | 오늘 글 수집 / 신규 저장 | {run.collected_count} / {run.new_count} |",
        f"| 수집 | 실패 페이지 / 재시도 / 날짜 파싱 폴백 | {run.pages_failed} / {run.crawl_retries} / {run.date_fallbacks} |",
        f"| 분류 | 처리 대상 미분류 글 | {run.unclassified_count} |",
        f"| 분류 | 분류 / 스팸 / 보류 / 실패 | {run.classified_count} / {run.spam_count} / "
        f"{run.deferred_count} / {run.failed_count} |",
        f"| LLM | 요청 / 성공 / 재시도 | {run.llm_requests} / {run.llm_ok} / {run.llm_retries} |",
        f"| LLM | 오류 유형 | {errors} |",
        f"| LLM | 평균 지연 / 값 폴백 | {latency} / {run.fallback_count} |",
        f"| 집계 | hourly / daily 갱신 | {run.hourly_buckets} / {run.daily_buckets} |",
        "",
    ]
    if run.stage_errors or run.error_message:
        lines += ["### 오류", ""]
        lines += [f"- {e}" for e in run.stage_errors]
        if run.error_message:
            lines.append(f"- 실행 중단: `{run.error_message}`")
        lines.append("")
    lines += ["### 데이터 품질", ""]
    if findings:
        icon = {"critical": "🚨", "warning": "⚠️"}
        lines += [f"- {icon.get(f.level, '')} {f.message}" for f in findings]
    else:
        lines.append("- 이상 없음")
    return "\n".join(lines) + "\n"


def publish(run: RunRecord, findings: list[Finding]) -> None:
    """Actions 환경이면 요약 파일에 추가하고 경고 어노테이션 출력. 로컬이면 아무것도 안 함."""
    path = os.environ.get("GITHUB_STEP_SUMMARY")
    if path:
        with open(path, "a", encoding="utf-8") as f:
            f.write(render_markdown(run, findings))
    if os.environ.get("GITHUB_ACTIONS") == "true":
        for finding in findings:
            kind = "error" if finding.level == "critical" else "warning"
            print(f"::{kind} title=데이터 품질 ({finding.code})::{finding.message}", flush=True)
