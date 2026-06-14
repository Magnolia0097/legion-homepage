import logging
from datetime import datetime, timezone
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


def fetch_unclassified(limit: int = 50) -> list[dict]:
    """classified_at IS NULL인 게시글을 최신 순으로 반환.

    최신 글(오늘 작성분)을 먼저 분류해 당일 대시보드가 빨리 채워지도록 함.
    누적 백로그가 있어도 오늘 글이 뒤로 밀리지 않는다.
    """
    db = get_supabase(use_service_role=True)
    try:
        rows = (
            db.table("voice_raw_posts")
            .select("id, title, body")
            .is_("classified_at", "null")
            .order("posted_at", desc=True)
            .limit(limit)
            .execute()
        ).data
        return rows or []
    except Exception as exc:
        logger.error("미분류 게시글 조회 실패: %s", exc)
        return []


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
    """스팸 게시글을 sentiment='spam'으로 마킹하고 classified_at을 기록."""
    db = get_supabase(use_service_role=True)
    try:
        db.table("voice_raw_posts").update({
            "sentiment": "spam",
            "classified_at": datetime.now(tz=timezone.utc).isoformat(),
        }).eq("id", post_id).execute()
    except Exception as exc:
        logger.error("스팸 마킹 실패 (id=%s): %s", post_id, exc)
