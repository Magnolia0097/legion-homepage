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
    """classified_at IS NULL인 게시글을 오래된 순으로 반환."""
    db = get_supabase(use_service_role=True)
    try:
        rows = (
            db.table("voice_raw_posts")
            .select("id, title, body")
            .is_("classified_at", "null")
            .order("posted_at", desc=False)
            .limit(limit)
            .execute()
        ).data
        return rows or []
    except Exception as exc:
        logger.error("미분류 게시글 조회 실패: %s", exc)
        return []


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
