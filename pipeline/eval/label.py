"""터미널 라벨링 도구 — 골든셋 글을 하나씩 보여주고 키 한 번으로 정답 라벨을 단다.

    cd pipeline
    uv run python -m eval.label            # 이어하기: 첫 미라벨 글부터
    uv run python -m eval.label --start 1  # 처음부터 다시 훑기

키:  1 긍정 · 2 부정 · 3 중립 · s 건너뛰기 · ? 애매함 표시(토글)
     b 이전 · n 다음(변경 없이) · h 도움말 · q 저장하고 종료

- 모든 입력은 즉시 golden_<ver>.csv에 저장된다(원자적 쓰기) — 언제 꺼도 이어할 수 있다.
- 분류기 예측값은 일부러 보여주지 않는다(앵커링 방지, LABELING_GUIDE.md 원칙 2).
- 원문 캐시가 없으면 DB에서 받아 로컬 캐시(.cache/, gitignore)에 저장한다.
"""

from __future__ import annotations

import argparse
import sys
import textwrap
from collections import Counter
from collections.abc import Callable
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from eval.golden import (  # noqa: E402
    KST,
    LABELS,
    SKIP,
    cache_path,
    fetch_posts,
    manifest_path,
    read_cache,
    read_manifest,
    write_cache,
    write_manifest,
)

KEY_TO_LABEL = {"1": "positive", "2": "negative", "3": "neutral"}
LABEL_KO = {"positive": "긍정", "negative": "부정", "neutral": "중립", SKIP: "건너뜀", "": "-"}
QUIT_KEYS = {"q", "Q", "\x03", "\x04"}  # q, Ctrl-C, Ctrl-D

HELP = "1 긍정 · 2 부정 · 3 중립 · s 건너뛰기 · ? 애매함 · b 이전 · n 다음 · q 종료"


# ── 상태 기계 (터미널과 분리 — 테스트 대상) ─────────────────────────────────────

class LabelSession:
    """라벨링 진행 상태. 키 하나를 받아 상태를 바꾸고 이벤트 이름을 돌려준다."""

    def __init__(self, rows: list[dict], save: Callable[[list[dict]], None], start: int | None = None):
        self.rows = rows
        self._save = save
        self.idx = self.first_unlabeled() if start is None else max(0, min(start, len(rows)))

    def first_unlabeled(self) -> int:
        for i, r in enumerate(self.rows):
            if not r["label"]:
                return i
        return len(self.rows)

    @property
    def done(self) -> bool:
        return self.idx >= len(self.rows)

    @property
    def current(self) -> dict | None:
        return None if self.done else self.rows[self.idx]

    def stats(self) -> Counter:
        c = Counter(r["label"] or "unlabeled" for r in self.rows)
        c["ambiguous"] = sum(1 for r in self.rows if r["ambiguous"])
        return c

    def handle(self, key: str) -> str:
        if key in QUIT_KEYS:
            return "quit"
        if key in ("h", "H"):
            return "help"
        if key in ("b", "B"):
            self.idx = max(0, self.idx - 1)
            return "back"
        if self.done:
            return "invalid"
        row = self.rows[self.idx]
        if key in KEY_TO_LABEL or key in ("s", "S"):
            row["label"] = KEY_TO_LABEL.get(key, SKIP)
            self._save(self.rows)
            self.idx += 1
            return "skipped" if row["label"] == SKIP else "labeled"
        if key == "?":
            row["ambiguous"] = not row["ambiguous"]
            self._save(self.rows)
            return "ambiguous_on" if row["ambiguous"] else "ambiguous_off"
        if key in ("n", "N"):
            self.idx += 1
            return "next"
        return "invalid"


# ── 터미널 입출력 ─────────────────────────────────────────────────────────────

def getch() -> str:
    """Enter 없이 키 하나 읽기 (POSIX termios / Windows msvcrt / 비대화형이면 줄 입력)."""
    if not sys.stdin.isatty():
        line = sys.stdin.readline()
        return line.strip()[:1] if line else "q"
    try:
        import msvcrt  # Windows

        return msvcrt.getwch()
    except ImportError:
        import termios
        import tty

        fd = sys.stdin.fileno()
        old = termios.tcgetattr(fd)
        try:
            tty.setraw(fd)
            return sys.stdin.read(1)
        finally:
            termios.tcsetattr(fd, termios.TCSADRAIN, old)


def _fmt_date(iso: str) -> str:
    try:
        return datetime.fromisoformat(iso.replace("Z", "+00:00")).astimezone(KST).strftime("%Y-%m-%d %H:%M KST")
    except ValueError:
        return iso


def render(session: LabelSession, posts: dict[int, dict], version: str, notice: str = "") -> None:
    row = session.current
    st = session.stats()
    labeled = sum(st[lbl] for lbl in LABELS)
    print("\033[2J\033[H", end="")  # 화면 지우기
    print(f"골든셋 {version}  [{session.idx + 1}/{len(session.rows)}]  "
          f"라벨 {labeled} · 건너뜀 {st[SKIP]} · 남음 {st['unlabeled']} · 애매 {st['ambiguous']}")
    print("─" * 72)
    post = posts.get(row["post_id"]) if row else None
    if post is None:
        print(f"(post_id={row['post_id']} 원문 없음 — DB에서 삭제됐을 수 있음. s로 건너뛰세요)")
    else:
        print(f"게시판: {post['board']}   작성: {_fmt_date(post['posted_at'])}\n")
        print(f"\033[1m{post['title']}\033[0m\n")
        body = (post.get("body") or "").strip()
        print(textwrap.fill(body[:600] + ("…" if len(body) > 600 else ""), 70) if body else "(본문 없음 — 제목만으로 판단)")
    print("─" * 72)
    current = LABEL_KO[row["label"]] + (" · 애매함" if row["ambiguous"] else "")
    print(f"현재 라벨: {current}")
    print(HELP)
    if notice:
        print(f"\n{notice}")


def ensure_cache(version: str, rows: list[dict]) -> dict[int, dict]:
    path = cache_path(version)
    posts = read_cache(path) if path.exists() else {}
    missing = [r["post_id"] for r in rows if r["post_id"] not in posts]
    if missing:
        print(f"원문 캐시에 없는 {len(missing)}건을 DB에서 조회합니다 (service_role 키 필요)…")
        fetched = fetch_posts(missing)
        posts.update({p["post_id"]: p for p in fetched})
        write_cache(path, [posts[r["post_id"]] for r in rows if r["post_id"] in posts])
    return posts


def print_summary(session: LabelSession, version: str) -> None:
    st = session.stats()
    print("\n" + "─" * 72)
    print(f"골든셋 {version} 진행 상황")
    for lbl in LABELS:
        print(f"  {LABEL_KO[lbl]:<4} {st[lbl]:>4}")
    print(f"  건너뜀 {st[SKIP]:>4}   애매함 표시 {st['ambiguous']:>4}   미라벨 {st['unlabeled']:>4}")
    print(f"저장 위치: {manifest_path(version)} (post_id·label·ambiguous만 — 커밋해도 됨)")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--version", default="v1")
    ap.add_argument("--start", type=int, help="1부터 시작하는 위치에서 시작 (기본: 첫 미라벨 글)")
    args = ap.parse_args(argv)

    path = manifest_path(args.version)
    if not path.exists():
        print(f"{path} 가 없습니다. 먼저 uv run python -m eval.sample_golden --cutoff YYYY-MM-DD")
        return 1
    rows = read_manifest(path)
    posts = ensure_cache(args.version, rows)

    session = LabelSession(rows, save=lambda r: write_manifest(path, r),
                           start=None if args.start is None else args.start - 1)
    notice = ""
    while not session.done:
        render(session, posts, args.version, notice)
        event = session.handle(getch())
        if event == "quit":
            break
        notice = {"help": HELP, "invalid": "알 수 없는 키 — h로 도움말"}.get(event, "")
    print_summary(session, args.version)
    return 0


if __name__ == "__main__":
    sys.exit(main())
