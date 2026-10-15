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
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from urllib.robotparser import RobotFileParser

import requests
from bs4 import BeautifulSoup

from ..config import get_settings
from ..db import get_supabase
from ..retry import call_with_retry

logger = logging.getLogger(__name__)

KST = timezone(timedelta(hours=9))
INVEN_BASE = "https://www.inven.co.kr"

BOARD_NAMES: dict[int, str] = {
    6388: "자유",
    6438: "수호성",
    6448: "검성",
    6449: "살성",
    6450: "궁성",
    6451: "호법성",
    6452: "치유성",
    6453: "마도성",
    6454: "정령성",
}

_REQUEST_TIMEOUT = 10  # 초 — 연결·읽기 각각
_RETRY_STATUS = {429, 500, 502, 503, 504}


@dataclass
class CrawlStats:
    """실행 1회의 수집 지표 — 실행 요약·pipeline_runs 기록용."""

    pages_ok: int = 0
    pages_failed: int = 0   # 재시도까지 실패한 페이지
    retries: int = 0
    date_fallbacks: int = 0  # 날짜 파싱 실패로 현재 시각을 넣은 글


crawl_stats = CrawlStats()


def reset_crawl_stats() -> None:
    """실행 시작 시 호출. 다른 모듈이 잡고 있는 참조가 끊기지 않도록 제자리에서 초기화."""
    crawl_stats.__init__()


class _RetryableStatus(Exception):
    """재시도할 HTTP 상태(429·5xx). Retry-After 헤더가 숫자면 retry_after로 전달."""

    def __init__(self, response: requests.Response):
        super().__init__(f"HTTP {response.status_code}")
        self.response = response
        ra = response.headers.get("Retry-After", "")
        self.retry_after = float(ra) if ra.isdigit() else None


def _is_retryable(exc: BaseException) -> bool:
    # ConnectTimeout은 ConnectionError·Timeout 둘 다의 하위 클래스
    return isinstance(exc, (requests.ConnectionError, requests.Timeout, _RetryableStatus))


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


_ROBOTS_UNSET = object()
_robots_cache: object = _ROBOTS_UNSET  # RobotFileParser | None(=규칙 없음, 허용)


def _load_robots() -> RobotFileParser | None:
    """robots.txt를 타임아웃 있는 세션으로 1회 조회.

    예전엔 RobotFileParser.read()(urllib, 타임아웃 없음)를 게시판마다 호출했다. 인벤 접속이
    막히면 게시판당 OS TCP 타임아웃(수 분)씩 멈춰 Actions 15분 제한을 넘겼다(취소된 49회 실행의 원인).
    정책은 그대로: 읽기 실패·401/403·404면 규칙 없음으로 보고 허용(ADR 004: /board/aion2/* 허용 확인).
    """
    try:
        resp = _get_session().get(f"{INVEN_BASE}/robots.txt", timeout=_REQUEST_TIMEOUT)
    except requests.RequestException as exc:
        logger.warning(f"robots.txt 읽기 실패, 허용으로 간주: {exc}")
        return None
    if resp.status_code >= 400:
        logger.warning(f"robots.txt {resp.status_code} 응답, 규칙 없음으로 간주 (허용)")
        return None
    rp = RobotFileParser()
    rp.parse(resp.text.splitlines())
    return rp


def _check_robots(target_url: str) -> bool:
    """robots.txt 규칙상 수집 가능 여부. robots.txt는 프로세스당 1회만 조회해 캐시."""
    global _robots_cache
    if _robots_cache is _ROBOTS_UNSET:
        _robots_cache = _load_robots()
    if _robots_cache is None:
        return True
    allowed = _robots_cache.can_fetch(get_settings().inven_user_agent, target_url)
    if not allowed:
        logger.warning(f"robots.txt 차단: {target_url}")
    return allowed


def _fetch_page(url: str) -> requests.Response:
    """목록 페이지 GET — 연결 오류·타임아웃·429/5xx는 지수 백오프로 최대 3회 시도."""
    session = _get_session()

    def _once() -> requests.Response:
        resp = session.get(url, timeout=_REQUEST_TIMEOUT)
        if resp.status_code in _RETRY_STATUS:
            raise _RetryableStatus(resp)
        resp.raise_for_status()
        return resp

    def _count_retry(*_args) -> None:
        crawl_stats.retries += 1

    # 재시도 간격도 요청 간격 정책(최소 3초)을 지킨다
    return call_with_retry(
        _once, is_retryable=_is_retryable, on_retry=_count_retry,
        base=3.0, min_delay=get_settings().inven_request_interval,
    )


def _parse_posted_at(raw: str, now: datetime | None = None) -> datetime:
    """인벤 날짜 문자열 → timezone-aware datetime (KST).

    목록 페이지에서 확인된 표기:
    - '12:30'             오늘 글 (시각만)
    - '07-19'             며칠 지난 글 (월-일만, 시각 없음 → 00:00으로 저장)
    - '04.21 12:30'       월.일 시각
    - '2026.04.21 12:30'  연도 포함

    연도가 없는 표기는 올해로 가정하되, 그 결과가 미래면 작년 글로 본다
    (1월 1일에 12-31 글을 보는 경우).

    Args:
        now: 기준 시각(테스트용). 기본은 현재 KST.
    """
    raw = raw.strip()
    now = now or datetime.now(tz=KST)
    today = now.date()

    def _without_future(dt: datetime) -> datetime:
        # 연도 생략 표기가 미래로 해석되면 작년 글
        return dt.replace(year=dt.year - 1) if dt.date() > today else dt

    # YYYY.MM.DD HH:MM / YYYY-MM-DD HH:MM
    m = re.match(r"(\d{4})[.-](\d{2})[.-](\d{2})\s+(\d{2}):(\d{2})", raw)
    if m:
        return datetime(
            int(m.group(1)), int(m.group(2)), int(m.group(3)),
            int(m.group(4)), int(m.group(5)),
            tzinfo=KST,
        )
    # MM.DD HH:MM
    m = re.match(r"(\d{2})\.(\d{2})\s+(\d{2}):(\d{2})", raw)
    if m:
        return _without_future(datetime(
            today.year, int(m.group(1)), int(m.group(2)),
            int(m.group(3)), int(m.group(4)),
            tzinfo=KST,
        ))
    # MM-DD (시각 없음) — 2026-07 운영 로그에서 파싱 실패로 확인된 표기.
    # 예전엔 현재 시각으로 대체돼 지난 글이 "오늘 글"로 저장되고 오늘 집계를 부풀렸다.
    m = re.match(r"(\d{2})-(\d{2})$", raw)
    if m:
        return _without_future(datetime(
            today.year, int(m.group(1)), int(m.group(2)), tzinfo=KST,
        ))
    # HH:MM (오늘)
    m = re.match(r"(\d{2}):(\d{2})$", raw)
    if m:
        return datetime(
            today.year, today.month, today.day,
            int(m.group(1)), int(m.group(2)),
            tzinfo=KST,
        )

    logger.warning(f"날짜 파싱 실패, 현재 시각으로 대체: '{raw}'")
    crawl_stats.date_fallbacks += 1
    return now


def parse_post_list(html: str, board_id: int) -> list[dict]:
    """목록 페이지 HTML에서 게시글 메타데이터 추출.

    CSS 클래스 추측 대신 URL 패턴으로 링크를 탐색하고 부모 행(li/tr)을 가져오는
    방식이므로 카드형/테이블형 레이아웃 변경에 영향받지 않음.

    Returns:
        list of dict with keys:
            source, external_id, url, title, author, posted_at (ISO str), body
    """
    soup = BeautifulSoup(html, "lxml")
    posts: list[dict] = []
    post_url_re = re.compile(rf"/board/aion2/{board_id}/(\d+)")
    seen_ids: set[str] = set()

    for link in soup.find_all("a", href=post_url_re):
        href = link.get("href", "")
        m = post_url_re.search(href)
        if not m:
            continue
        post_id = m.group(1)
        if post_id in seen_ids:
            continue

        # 부모 행 탐색: li·tr(전통 목록), article·section(현대 카드형), div 폴백
        row = link.find_parent(["li", "tr", "article", "section"])
        if not row:
            # div 기반 레이아웃: 날짜·작성자 정보를 포함한 가장 가까운 div 탐색
            candidate = link.parent
            for _ in range(5):  # 최대 5레벨 위까지만 탐색
                if candidate is None or candidate.name in ("body", "html"):
                    break
                if candidate.name == "div" and candidate.select_one(
                    ".date, .td-date, time, .time, .writer, .td-writer, .nickname, .nick, .tit"
                ):
                    row = candidate
                    break
                candidate = candidate.parent

        if not row:
            # 최후 폴백: 링크 텍스트만으로 게시글 생성 (날짜·작성자 없음)
            title = link.get_text(strip=True)
            if not title:
                continue
            seen_ids.add(post_id)
            posts.append({
                "source": "inven_aion2",
                "external_id": f"{board_id}_{post_id}",
                "url": f"{INVEN_BASE}/board/aion2/{board_id}/{post_id}",
                "title": title,
                "author": "",
                "posted_at": datetime.now(tz=KST).isoformat(),
                "board_name": BOARD_NAMES.get(board_id),
                "body": None,
            })
            continue

        # 공지 제외: class 기반 + .cate 텍스트 기반 모두 검사
        row_classes = row.get("class") or []
        if any(c in row_classes for c in ("notice", "li-notice", "noti")):
            continue
        cate_tag = row.select_one(".cate")
        if cate_tag and cate_tag.get_text(strip=True) in ("공지", "이벤트공지", "긴급공지"):
            continue

        # 제목: .tit 우선, 없으면 링크 텍스트
        title_tag = row.select_one(".tit")
        title = title_tag.get_text(strip=True) if title_tag else link.get_text(strip=True)
        if not title:
            continue

        # 작성자·날짜
        author_tag = row.select_one(".writer, .td-writer, .nickname, .nick")
        author = author_tag.get_text(strip=True) if author_tag else ""
        date_tag = row.select_one(".date, .td-date, time, .time")
        raw_date = date_tag.get_text(strip=True) if date_tag else ""
        posted_at = _parse_posted_at(raw_date) if raw_date else datetime.now(tz=KST)

        seen_ids.add(post_id)
        posts.append({
            "source": "inven_aion2",
            "external_id": f"{board_id}_{post_id}",
            "url": f"{INVEN_BASE}/board/aion2/{board_id}/{post_id}",
            "title": title,
            "author": author,
            "posted_at": posted_at.isoformat(),
            "board_name": BOARD_NAMES.get(board_id),
            "body": None,
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

    all_posts: list[dict] = []
    first_url = f"{INVEN_BASE}/board/aion2/{board_id}"

    # robots.txt 체크 (프로세스당 1회 조회 후 캐시)
    if not _check_robots(first_url):
        return []

    for page in range(1, max_pages + 1):
        url = first_url if page == 1 else f"{first_url}?p={page}"
        logger.info(f"요청: {url}")

        try:
            resp = _fetch_page(url)
        except (requests.RequestException, _RetryableStatus) as exc:
            crawl_stats.pages_failed += 1
            logger.error(f"요청 실패(재시도 소진): {url} — {exc}")
            break
        crawl_stats.pages_ok += 1

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

    # 같은 배치 안의 중복 제거 — 수집 중 새 글이 올라오면 1페이지 글이 2페이지로 밀려
    # 두 번 잡힌다. DB 제약이 막아 주지만, 미리 걸러야 신규/중복 건수가 정확하다.
    unique: dict[tuple[str, str], dict] = {}
    for p in posts:
        unique.setdefault((p["source"], p["external_id"]), p)
    if len(unique) < len(posts):
        logger.info(f"배치 내 중복 {len(posts) - len(unique)}건 제거")
    posts = list(unique.values())

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
