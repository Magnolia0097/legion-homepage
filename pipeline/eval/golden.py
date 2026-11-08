"""골든셋 공용 모듈 — 경로, 층화 추출, 파일 입출력, DB 조회.

순수 함수(allocate·stratified_sample·period_of)와 입출력을 분리해 두어
DB 없이도 추출 로직을 테스트할 수 있다.
"""

from __future__ import annotations

import csv
import io
import json
import os
import random
import tempfile
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

EVAL_DIR = Path(__file__).parent
GOLDEN_DIR = EVAL_DIR / "golden"
CACHE_DIR = EVAL_DIR / ".cache"  # .gitignore — 원문은 로컬에만

KST = timezone(timedelta(hours=9))
UNKNOWN_BOARD = "(미상)"  # board_name 컬럼이 생기기 전 수집분

# 라벨 체계 — src/processors/classifier.py VALID_SENTIMENTS와 동일 (spam은 Tier-1 필터 담당)
LABELS: tuple[str, ...] = ("positive", "negative", "neutral")
SKIP = "skip"  # 라벨 불가(광고·무관 글 등) — 평가에서 제외하고 건수만 보고

MANIFEST_FIELDS = ["post_id", "label", "ambiguous"]


def manifest_path(version: str) -> Path:
    return GOLDEN_DIR / f"golden_{version}.csv"


def meta_path(version: str) -> Path:
    return GOLDEN_DIR / f"golden_{version}.meta.json"


def cache_path(version: str) -> Path:
    return CACHE_DIR / f"golden_{version}_posts.jsonl"


# ── 층화 추출 (순수 함수) ─────────────────────────────────────────────────────

@dataclass(frozen=True)
class FrameRow:
    """추출 프레임의 한 행. 분류 결과(sentiment)는 의도적으로 갖지 않는다 —
    특정 분류기의 예측으로 층화하면 그 분류기에 유리한 표본이 되기 때문."""

    post_id: int
    board: str
    period: str  # KST 기준 'YYYY-MM'

    @property
    def stratum(self) -> tuple[str, str]:
        return (self.board, self.period)


def period_of(posted_at: str) -> str:
    """ISO 타임스탬프 → KST 기준 월('YYYY-MM'). 대시보드가 KST로 하루를 나누는 것과 맞춘다."""
    dt = datetime.fromisoformat(posted_at.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(KST).strftime("%Y-%m")


def allocate(sizes: dict[tuple[str, str], int], n: int) -> dict[tuple[str, str], int]:
    """비례 배분 + 최대 잉여(largest remainder) 반올림.

    표본이 모집단 분포(게시판·월 비중)를 그대로 따르게 해 가중치 없이도 지표가
    운영 분포를 대표하도록 한다. 합계가 정확히 n이 되도록 소수점 이하를 큰 순으로 배분.
    """
    total = sum(sizes.values())
    if n > total:
        raise ValueError(f"표본 {n}건 > 모집단 {total}건")
    quotas = {k: n * v / total for k, v in sizes.items()}
    alloc = {k: int(q) for k, q in quotas.items()}
    remaining = n - sum(alloc.values())
    # 동률은 층 이름으로 정렬해 결정적으로
    order = sorted(quotas, key=lambda k: (-(quotas[k] - alloc[k]), k))
    for k in order[:remaining]:
        alloc[k] += 1
    return alloc


def stratified_sample(frame: Iterable[FrameRow], n: int, seed: int) -> tuple[list[int], dict]:
    """게시판×월 층화 무작위 추출.

    결정성: 층마다 post_id를 정렬한 뒤 f"{seed}|{board}|{period}" 문자열 시드로 뽑는다.
    (str 시드는 PYTHONHASHSEED와 무관하게 SHA-512로 고정) 다른 층에 행이 추가돼도
    해당 층의 추출 결과는 변하지 않는다. 최종 순서는 라벨링 편향(같은 게시판·시기가
    몰려 나오는 것)을 막기 위해 시드로 섞는다.

    Returns:
        (섞인 post_id 목록, 층별 {"population", "sample"} 메타)
    """
    by_stratum: dict[tuple[str, str], list[int]] = {}
    for row in frame:
        by_stratum.setdefault(row.stratum, []).append(row.post_id)

    sizes = {k: len(v) for k, v in by_stratum.items()}
    alloc = allocate(sizes, n)

    picked: list[int] = []
    strata_meta = []
    for key in sorted(by_stratum):
        ids = sorted(by_stratum[key])
        rng = random.Random(f"{seed}|{key[0]}|{key[1]}")
        take = alloc[key]
        picked.extend(rng.sample(ids, take))
        strata_meta.append({
            "board": key[0], "period": key[1],
            "population": len(ids), "sample": take,
        })

    random.Random(f"{seed}|order").shuffle(picked)
    return picked, {"strata": strata_meta}


# ── 매니페스트(커밋 대상: post_id + 라벨만) ────────────────────────────────────

def _atomic_write_text(path: Path, text: str) -> None:
    """임시 파일에 쓴 뒤 rename — 라벨링 도중 강제 종료돼도 파일이 깨지지 않게."""
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="") as f:
            f.write(text)
        os.replace(tmp, path)
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise


def write_manifest(path: Path, rows: list[dict]) -> None:
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=MANIFEST_FIELDS, lineterminator="\n")
    writer.writeheader()
    for r in rows:
        writer.writerow({
            "post_id": r["post_id"],
            "label": r.get("label") or "",
            "ambiguous": 1 if r.get("ambiguous") else 0,
        })
    _atomic_write_text(path, buf.getvalue())


def read_manifest(path: Path) -> list[dict]:
    with path.open(encoding="utf-8", newline="") as f:
        rows = []
        for r in csv.DictReader(f):
            label = (r.get("label") or "").strip()
            if label and label not in (*LABELS, SKIP):
                raise ValueError(f"알 수 없는 라벨 {label!r} (post_id={r['post_id']})")
            rows.append({
                "post_id": int(r["post_id"]),
                "label": label,
                "ambiguous": (r.get("ambiguous") or "0").strip() == "1",
            })
    return rows


def write_meta(path: Path, meta: dict) -> None:
    _atomic_write_text(path, json.dumps(meta, ensure_ascii=False, indent=2) + "\n")


# ── 로컬 원문 캐시 (gitignore) ────────────────────────────────────────────────

def write_cache(path: Path, posts: list[dict]) -> None:
    lines = "".join(json.dumps(p, ensure_ascii=False) + "\n" for p in posts)
    _atomic_write_text(path, lines)


def read_cache(path: Path) -> dict[int, dict]:
    with path.open(encoding="utf-8") as f:
        return {p["post_id"]: p for p in map(json.loads, f) if p}


# ── DB 조회 (service_role) ───────────────────────────────────────────────────

_PAGE_SIZE = 1000  # PostgREST 기본 응답 상한


def fetch_frame_rows(cutoff_iso: str) -> list[dict]:
    """추출 프레임용 행 전체를 id 순 페이지네이션으로 조회.

    author·sentiment 등은 가져오지 않는다 (개인정보 최소화 + 예측값 비의존).
    is_spam() 판정용으로 title·body만 함께 받는다.
    """
    from src.db import get_supabase

    db = get_supabase(use_service_role=True)
    rows: list[dict] = []
    last_id = 0
    while True:
        page = (
            db.table("voice_raw_posts")
            .select("id, title, body, board_name, posted_at")
            .lt("posted_at", cutoff_iso)
            .gt("id", last_id)
            .order("id")
            .limit(_PAGE_SIZE)
            .execute()
        ).data or []
        rows.extend(page)
        if len(page) < _PAGE_SIZE:
            return rows
        last_id = page[-1]["id"]


def fetch_posts(post_ids: list[int]) -> list[dict]:
    """라벨링 화면에 띄울 원문을 id로 조회.

    작성자는 개인정보라, URL은 원문을 열어 보지 않고 분류기와 같은 정보(제목·본문)로만
    판단하기 위해 가져오지 않는다 (LABELING_GUIDE.md 원칙 1).
    """
    from src.db import get_supabase

    db = get_supabase(use_service_role=True)
    out: list[dict] = []
    for i in range(0, len(post_ids), 200):  # URL 길이 제한 대비 분할
        chunk = post_ids[i:i + 200]
        out.extend(
            (
                db.table("voice_raw_posts")
                .select("id, title, body, board_name, posted_at")
                .in_("id", chunk)
                .execute()
            ).data or []
        )
    return [
        {
            "post_id": r["id"],
            "title": r.get("title") or "",
            "body": r.get("body") or "",
            "board": r.get("board_name") or UNKNOWN_BOARD,
            "posted_at": r.get("posted_at") or "",
        }
        for r in out
    ]
