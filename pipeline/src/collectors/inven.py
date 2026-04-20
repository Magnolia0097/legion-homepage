"""
인벤 Aion 2 게시판 크롤러.

수집 정책 (ADR 004 준수):
- robots.txt 확인 후 수집 (/board/aion2/* 허용 확인됨, 2026-04-21)
- User-Agent에 서비스명 및 연락처 명시
- 페이지 요청 간격 최소 3초 유지 (IP 차단 방지)
- 원문은 DB 내부 저장에 한정 / 대시보드는 LLM 요약(issue_summary)만 노출

관련 문서:
- ADR 004: docs/decisions/004-data-source-pivot.md
"""

from __future__ import annotations

import logging
import re
import time
from datetime import datetime, timedelta, timezone
from urllib.robotparser import RobotFileParser

import requests
from bs4 import BeautifulSoup

from ..config import get_settings
from ..db import get_supabase

logger = logging.getLogger(__name__)

KST = timezone(timedelta(hours=9))
INVEN_BASE = "https://www.inven.co.kr"

# 모듈 레벨 Session 싱글톤 — 커넥션 재사용으로 오버헤드 감소
_session: requests.Session | None = None


def _get_session() -> requests.Session:
    global _session
    if _session is None:
        settings = get_settings()
        _session = requests.Session()
        _session.headers.update({
            "User-Agent": settings.inven_user_agent,
            "Accept-Language": "ko-KR,ko;q=0.9",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        })
    return _session


def _check_robots(target_url: str) -> bool:
    """robots.txt 확인, 수집 가능 여부 반환. 읽기 실패 시 허용으로 간주."""
    settings = get_settings()
    rp = RobotFileParser()
    rp.set_url(f"{INVEN_BASE}/robots.txt")
    try:
        rp.read()
    except Exception as exc:
        logger.warning(f"robots.txt 읽기 실패, 허용으로 간주: {exc}")
        return True
    allowed = rp.can_fetch(settings.inven_user_agent, target_url)
    if not allowed:
        logger.warning(f"robots.txt 차단: {target_url}")
    return allowed


def _parse_posted_at(raw: str) -> datetime:
    """인벤 날짜 문자열 → timezone-aware datetime (KST).

    인벤 표시 형식 (추정):                  # 실제 HTML 확인 후 조정 필요
    - '2026.04.21 12:30'  (오래된 글, 연도 포함)
    - '04.21 12:30'       (올해 글, 연도 생략)
    - '12:30'             (오늘 글, 날짜 생략)
    """
    raw = raw.strip()
    today = datetime.now(tz=KST).date()

    # YYYY.MM.DD HH:MM                      # 실제 HTML 확인 후 조정 필요
    m = re.match(r"(\d{4})\.(\d{2})\.(\d{2})\s+(\d{2}):(\d{2})", raw)
    if m:
        return datetime(
            int(m.group(1)), int(m.group(2)), int(m.group(3)),
            int(m.group(4)), int(m.group(5)),
            tzinfo=KST,
        )
    # MM.DD HH:MM                            # 실제 HTML 확인 후 조정 필요
    m = re.match(r"(\d{2})\.(\d{2})\s+(\d{2}):(\d{2})", raw)
    if m:
        return datetime(
            today.year, int(m.group(1)), int(m.group(2)),
            int(m.group(3)), int(m.group(4)),
            tzinfo=KST,
        )
    # HH:MM (오늘)                           # 실제 HTML 확인 후 조정 필요
    m = re.match(r"(\d{2}):(\d{2})$", raw)
    if m:
        return datetime(
            today.year, today.month, today.day,
            int(m.group(1)), int(m.group(2)),
            tzinfo=KST,
        )

    logger.warning(f"날짜 파싱 실패, 현재 시각으로 대체: '{raw}'")
    return datetime.now(tz=KST)


def parse_post_list(html: str, board_id: int) -> list[dict]:
    """목록 페이지 HTML에서 게시글 메타데이터 추출.

    ⚠️  셀렉터는 일반적인 인벤 게시판 패턴으로 추정 작성.
        실제 HTML 확인 후 조정 필요.
        test_inven.py 실행 시 0건이 나오면 이 함수의 셀렉터를 수정할 것.

    Returns:
        list of dict with keys:
            source, external_id, url, title, author, posted_at (ISO str), body
    """
    soup = BeautifulSoup(html, "lxml")
    posts: list[dict] = []
    post_url_re = re.compile(rf"/board/aion2/{board_id}/(\d+)")

    # ── 게시판 행 선택 (두 가지 구조 대응) ──────────────────────────────────
    # 인벤은 <ul class="list-body"> 또는 <table> 구조 중 하나  # 확인 후 조정 필요
    rows = soup.select("ul.list-body > li.li-row")          # 확인 후 조정 필요
    if not rows:
        rows = soup.select("table.board-list tbody tr")     # 확인 후 조정 필요
    if not rows:
        logger.warning(
            f"게시판 행을 찾지 못함 (board_id={board_id}). "
            "HTML 구조 변경 가능성 — parse_post_list 셀렉터 확인 필요."
        )
        return posts

    for row in rows:
        # ── 공지사항 제외 ────────────────────────────────────────────────────
        classes = row.get("class") or []                    # 확인 후 조정 필요
        if any(c in classes for c in ("notice", "li-notice", "noti")):
            continue

        # ── 제목 링크 → URL + post_id ────────────────────────────────────────
        link = row.select_one("a[href*='/board/aion2/']")   # 확인 후 조정 필요
        if not link:
            continue
        href = link.get("href", "")
        m = post_url_re.search(href)
        if not m:
            continue
        post_id = m.group(1)

        title = link.get_text(strip=True)
        if not title:
            continue

        # ── 작성자 ───────────────────────────────────────────────────────────
        author_tag = row.select_one(                        # 확인 후 조정 필요
            ".nickname, .writer, .td-writer, .name"
        )
        author = author_tag.get_text(strip=True) if author_tag else ""

        # ── 작성일시 ─────────────────────────────────────────────────────────
        date_tag = row.select_one(".date, .td-date, time")  # 확인 후 조정 필요
        raw_date = date_tag.get_text(strip=True) if date_tag else ""
        posted_at = _parse_posted_at(raw_date) if raw_date else datetime.now(tz=KST)

        posts.append({
            "source": "inven_aion2",
            "external_id": f"{board_id}_{post_id}",
            "url": f"{INVEN_BASE}/board/aion2/{board_id}/{post_id}",
            "title": title,
            "author": author,
            "posted_at": posted_at.isoformat(),
            "body": None,  # v1.1에서 상세 페이지 수집 후 채울 예정
        })

    logger.info(f"파싱 완료: {len(posts)}건 (board_id={board_id})")
    return posts


def collect_inven_aion2(
    board_id: int = 6388,
    max_pages: int = 1,
    sleep_seconds: float = 3.0,
) -> list[dict]:
    """인벤 Aion 2 게시판 최근 글 수집.

    Args:
        board_id: 게시판 ID (6388=자유 게시판)
        max_pages: 가져올 페이지 수 (기본 1)
        sleep_seconds: 페이지 간 요청 간격 (최소 3초, 기본 3.0)

    Returns:
        게시글 dict 리스트 (중복 제거 전 raw 데이터)
    """
    if sleep_seconds < 3.0:
        logger.warning(
            f"sleep_seconds={sleep_seconds}이 3초 미만. IP 차단 위험. 최소 3.0 권장."
        )

    session = _get_session()
    all_posts: list[dict] = []
    first_url = f"{INVEN_BASE}/board/aion2/{board_id}"

    # robots.txt 체크 (수집 시작 시 1회)
    if not _check_robots(first_url):
        return []

    for page in range(1, max_pages + 1):
        url = first_url if page == 1 else f"{first_url}?p={page}"
        logger.info(f"요청: {url}")

        try:
            resp = session.get(url, timeout=10)
            resp.raise_for_status()
        except requests.HTTPError as exc:
            logger.error(f"HTTP {exc.response.status_code} 에러: {url}")
            break
        except requests.RequestException as exc:
            logger.error(f"요청 실패: {url} — {exc}")
            break

        posts = parse_post_list(resp.text, board_id)
        all_posts.extend(posts)
        logger.info(f"페이지 {page}/{max_pages} 완료: {len(posts)}건")

        if page < max_pages:
            time.sleep(sleep_seconds)  # IP 차단 방지 — 절대 제거 금지

    logger.info(f"수집 완료: 총 {len(all_posts)}건 (board_id={board_id})")
    return all_posts


def save_posts(posts: list[dict]) -> int:
    """Supabase insert, 중복은 ON CONFLICT DO NOTHING으로 스킵, 신규 저장 건수 반환.

    중복 판단: UNIQUE(source, external_id)
    ignore_duplicates=True → 기존 분류 결과(sentiment 등)를 덮어쓰지 않음.
    """
    if not posts:
        logger.info("저장할 게시글 없음 (0건)")
        return 0

    db = get_supabase(use_service_role=True)
    try:
        # ignore_duplicates=True → ON CONFLICT DO NOTHING
        # response.data에는 실제 INSERT된 신규 행만 포함
        response = (
            db.table("voice_raw_posts")
            .upsert(posts, on_conflict="source,external_id", ignore_duplicates=True)
            .execute()
        )
        inserted = len(response.data) if response.data else 0
        logger.info(f"DB 저장: {inserted}건 신규 / {len(posts) - inserted}건 중복 스킵")
        return inserted
    except Exception as exc:
        logger.error(f"DB 저장 실패: {exc}")
        raise
