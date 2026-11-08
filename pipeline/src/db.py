import logging
from collections import Counter
from datetime import datetime, timedelta, timezone
from functools import lru_cache

from supabase import Client, create_client

from .config import get_settings

logger = logging.getLogger(__name__)


@lru_cache
def _get_client(use_service_role: bool) -> Client:
    settings = get_settings()
    key = settings.supabase_service_role_key if use_service_role else settings.supabase_anon_key
    return create_client(settings.supabase_url, key)


def get_supabase(use_service_role: bool = False) -> Client:
    """Supabase 클라이언트 반환.

    Args:
        use_service_role: True면 RLS를 우회하는 service_role 키 사용 (파이프라인 내부 전용).
                          False면 anon 키 사용 (읽기 전용 공개 접근).
    """
    return _get_client(use_service_role)


# batch 모드 분류 대기열에 필요한 컨럼 — 일괄 저장(upsert)에 식별 컨럼이 필요하다
QUEUE_COLUMNS = (
    "id, source, external_id, posted_at, classified_at, title, body, category_tag, board_name"
)
_PAGE = 1000  # PostgREST 기본 max_rows

# 예전 규칙(키워드·물음표·옛 스팸 규칙)으로 분류된 글 — LLM 재분류 대상.
# classified_by_model이 NULL인 분류 완료 글은 002 마이그레이션 이전 분류이거나 옛 스팸 마킹이다.
RULE_BASED_MODELS = ("local-keyword", "question-filter", "question-filter-v2")


def _paged(build, limit: int) -> list[dict]:
    """limit이 1000을 넘어도 다 받도록 range()로 나눠 조회. build(offset, end)는 실행 가능한 쿼리."""
    rows: list[dict] = []
    while len(rows) < limit:
        start = len(rows)
        end = min(limit, start + _PAGE) - 1
        page = build(start, end).execute().data or []
        rows.extend(page)
        if len(page) < end - start + 1:
            break
    return rows[:limit]


def fetch_unclassified(limit: int = 50, columns: str = "id, title, body") -> list[dict]:
    """classified_at IS NULL인 게시글을 최신 순으로 반환.

    최신 글(오늘 작성분)을 먼저 분류해 당일 대시보드가 빨리 채워지도록 함.
    누적 백로그가 있어도 오늘 글이 뒤로 밀리지 않는다.
    """
    db = get_supabase(use_service_role=True)
    try:
        return _paged(
            lambda start, end: (
                db.table("voice_raw_posts")
                .select(columns)
                .is_("classified_at", "null")
                .order("posted_at", desc=True)
                .order("id", desc=True)
                .range(start, end)
            ),
            limit,
        )
    except Exception as exc:
        logger.error("미분류 게시글 조회 실패: %s", exc)
        return []


def fetch_upgrade_candidates(limit: int, columns: str = QUEUE_COLUMNS) -> list[dict]:
    """예전 규칙으로 분류된 글(LLM 재분류 대상)을 최신 순으로 반환.

    Gemini 키가 막혀 있던 동안(최소 7월~) 쌓인 키워드·물음표 규칙 라벨과, '제목 15자 미만'
    규칙으로 잘못 붙은 spam 라벨을 남는 LLM 예산으로 점진적으로 다시 매긴다.
    """
    if limit <= 0:
        return []
    db = get_supabase(use_service_role=True)
    models = ",".join(RULE_BASED_MODELS)
    try:
        return _paged(
            lambda start, end: (
                db.table("voice_raw_posts")
                .select(columns)
                .not_.is_("classified_at", "null")
                .or_(f"classified_by_model.is.null,classified_by_model.in.({models})")
                .order("posted_at", desc=True)
                .order("id", desc=True)
                .range(start, end)
            ),
            limit,
        )
    except Exception as exc:
        logger.error("재분류 대상 조회 실패: %s", exc)
        return []


def fetch_recent_topics(hours: int = 48, limit: int = 30) -> list[str]:
    """최근 LLM이 붙인 이슈 topic 중 자주 쓰인 것 — 다음 분류 때 같은 문자열을 재사용하게 해
    '오늘의 주요 이슈'가 실행을 넘어 묶이도록 한다."""
    db = get_supabase(use_service_role=True)
    since = (datetime.now(tz=timezone.utc) - timedelta(hours=hours)).isoformat()
    try:
        rows = (
            db.table("voice_raw_posts")
            .select("issue_summary")
            .like("classified_by_model", "gemini%")
            .gte("posted_at", since)
            .not_.is_("issue_summary", "null")
            .limit(_PAGE)
            .execute()
        ).data or []
    except Exception as exc:
        logger.warning("최근 topic 조회 실패: %s", exc)
        return []
    counts = Counter((r.get("issue_summary") or "").strip() for r in rows)
    counts.pop("", None)
    return [t for t, n in counts.most_common(limit) if n >= 2]


def reset_all_classifications() -> int:
    """모든 게시글의 분류를 초기화(classified_at=NULL)해 다음 실행 때 재분류되게 함.

    분류 로직(예: 중립 제거)을 바꾼 뒤 기존 데이터까지 새 기준으로 다시 매기고 싶을 때 사용.
    스팸 포함 전부 초기화 — 다음 실행에서 필터·분류를 다시 거친다.

    Returns:
        초기화된 행 수 (응답 데이터 기준).
    """
    db = get_supabase(use_service_role=True)
    try:
        resp = (
            db.table("voice_raw_posts")
            .update({
                "classified_at": None,
                "sentiment": None,
                "categories": None,
                "issue_summary": None,
                "keywords": None,
            })
            .not_.is_("classified_at", "null")
            .execute()
        )
        count = len(resp.data or [])
        logger.info("분류 초기화 완료: %d건", count)
        return count
    except Exception as exc:
        logger.error("분류 초기화 실패: %s", exc)
        return 0


def mark_as_spam(post_id: int) -> None:
    """스팸 게시글을 sentiment='spam'으로 마킹하고 classified_at을 기록.

    classified_by_model='spam-filter'를 남겨 재분류 대기열(모델 NULL)에 다시 들어가지 않게 한다.
    """
    db = get_supabase(use_service_role=True)
    try:
        db.table("voice_raw_posts").update({
            "sentiment": "spam",
            "categories": None,
            "issue_summary": None,
            "keywords": None,
            "classified_by_model": "spam-filter",
            "classified_at": datetime.now(tz=timezone.utc).isoformat(),
        }).eq("id", post_id).execute()
    except Exception as exc:
        logger.error("스팸 마킹 실패 (id=%s): %s", post_id, exc)
