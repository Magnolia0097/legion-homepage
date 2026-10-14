-- 로컬/CI용 Supabase 역할 흉내 — 운영에서는 실행하지 않는다.
-- Supabase는 public 스키마의 새 테이블에 anon·authenticated·service_role 모두 ALL 권한을
-- 기본 부여한다(default privileges). 그 상태에서 마이그레이션이 권한을 올바르게 좁히는지 검증하려고
-- 같은 기본값을 재현한다.
DO $$
BEGIN
    CREATE ROLE anon NOLOGIN NOINHERIT;
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
    CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
EXCEPTION WHEN duplicate_object THEN
    NULL;  -- 같은 클러스터에서 재실행
END
$$;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES    TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
