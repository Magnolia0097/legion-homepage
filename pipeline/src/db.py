from functools import lru_cache

from supabase import Client, create_client

from .config import get_settings


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
