"""골든셋 추출 — DB에서 게시판×월 층화로 N건(기본 300)을 시드 고정 추출.

    cd pipeline
    uv run python -m eval.sample_golden --cutoff 2026-10-01

산출물:
- eval/golden/golden_<ver>.csv        post_id만 (라벨 칸은 비어 있음) — 커밋 대상
- eval/golden/golden_<ver>.meta.json  시드·기준일·층별 모집단/표본 수 — 커밋 대상
- eval/.cache/golden_<ver>_posts.jsonl 제목·본문 원문 — 로컬 전용(gitignore)

프레임 정의:
- posted_at < cutoff (KST 자정) — 기준일을 고정해 재실행해도 같은 모집단
- Tier-1 스팸 필터(is_spam) 통과 글만 — 운영에서 분류기에 도달하는 글과 같은 조건.
  DB의 sentiment='spam' 값 대신 현재 필터 코드로 다시 판정한다(분류 결과 비의존).
- 분류기 예측값(sentiment)은 조회조차 하지 않는다 — 예측으로 층화하면 비교가 편향된다.
"""

from __future__ import annotations

import argparse
import logging
import subprocess
import sys
from datetime import date, datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from eval.golden import (  # noqa: E402
    KST,
    UNKNOWN_BOARD,
    FrameRow,
    cache_path,
    fetch_frame_rows,
    manifest_path,
    meta_path,
    period_of,
    stratified_sample,
    write_cache,
    write_manifest,
    write_meta,
)
from src.processors.filter import is_spam  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger(__name__)


def _git_sha() -> str | None:
    try:
        return subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"], capture_output=True, text=True, check=True,
        ).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return None


def build_frame(rows: list[dict]) -> tuple[list[FrameRow], dict[int, dict], int]:
    """DB 행 → 스팸 제외 프레임 + 원문 캐시. (제외된 스팸 건수 함께 반환)"""
    frame: list[FrameRow] = []
    texts: dict[int, dict] = {}
    spam = 0
    for r in rows:
        if is_spam(r):
            spam += 1
            continue
        board = r.get("board_name") or UNKNOWN_BOARD
        frame.append(FrameRow(post_id=r["id"], board=board, period=period_of(r["posted_at"])))
        texts[r["id"]] = {
            "post_id": r["id"],
            "title": r.get("title") or "",
            "body": r.get("body") or "",
            "board": board,
            "posted_at": r["posted_at"],
        }
    return frame, texts, spam


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--version", default="v1", help="골든셋 버전 (파일명에 사용)")
    ap.add_argument("--n", type=int, default=300, help="표본 크기")
    ap.add_argument("--seed", type=int, default=20261014, help="난수 시드")
    ap.add_argument("--cutoff", required=True, type=date.fromisoformat,
                    help="이 날짜(KST 00:00) 이전 게시글만 프레임에 포함, 예: 2026-10-01")
    ap.add_argument("--force", action="store_true", help="기존 매니페스트 덮어쓰기 (라벨 유실 주의)")
    args = ap.parse_args(argv)

    out = manifest_path(args.version)
    if out.exists() and not args.force:
        logger.error("%s 가 이미 있습니다 — 라벨 보호를 위해 중단 (--force로 덮어쓰기)", out)
        return 1

    cutoff_dt = datetime.combine(args.cutoff, datetime.min.time(), tzinfo=KST)
    rows = fetch_frame_rows(cutoff_dt.isoformat())
    logger.info("프레임 후보 %d건 조회 (posted_at < %s)", len(rows), cutoff_dt.isoformat())

    frame, texts, spam = build_frame(rows)
    logger.info("스팸 필터 제외 %d건 → 프레임 %d건", spam, len(frame))

    picked, strata = stratified_sample(frame, args.n, args.seed)

    write_manifest(out, [{"post_id": pid} for pid in picked])
    write_meta(meta_path(args.version), {
        "version": args.version,
        "created_at": datetime.now(tz=timezone.utc).isoformat(timespec="seconds"),
        "git_sha": _git_sha(),
        "method": "게시판×월(KST) 층화, 비례배분(최대 잉여), 층별 시드 고정 무작위 추출",
        "seed": args.seed,
        "cutoff_kst": args.cutoff.isoformat(),
        "n": len(picked),
        "frame_size": len(frame),
        "spam_excluded": spam,
        **strata,
    })
    write_cache(cache_path(args.version), [texts[pid] for pid in picked])

    logger.info("골든셋 %d건 저장: %s (원문 캐시: %s)", len(picked), out, cache_path(args.version))
    logger.info("다음 단계: uv run python -m eval.label --version %s", args.version)
    return 0


if __name__ == "__main__":
    sys.exit(main())
