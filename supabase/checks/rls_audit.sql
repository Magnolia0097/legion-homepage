-- =============================================================================
-- rls_audit.sql — 운영 DB 공개 권한 점검 (읽기 전용, 아무것도 변경하지 않음)
-- 실행: Supabase 대시보드 → SQL Editor에 붙여넣고 Run. 결과는 쿼리별로 확인.
-- 용도: 004_restrict_anon_access.sql 적용 전·후 비교, 새 테이블 추가 후 정기 점검.
-- 마이그레이션 파일에 없는 테이블(대시보드에서 수동 생성한 것)까지 잡아내는 것이 목적.
-- =============================================================================

-- 1) public 스키마 테이블별 RLS 상태 + 정책 수
--    🚩 rls_enabled = false 인데 anon 권한이 있는 테이블은 anon 키로 읽기/쓰기 가능
--    (004 적용 후 voice_raw_posts는 컬럼 단위 GRANT라 anon_select=false가 정상 → 4번에서 확인)
SELECT
    c.relname                                         AS table_name,
    c.relrowsecurity                                  AS rls_enabled,
    c.relforcerowsecurity                             AS rls_forced,
    (SELECT count(*) FROM pg_policies p
      WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS policy_count,
    has_table_privilege('anon', c.oid, 'SELECT')      AS anon_select,
    has_table_privilege('anon', c.oid, 'INSERT')      AS anon_insert,
    has_table_privilege('anon', c.oid, 'UPDATE')      AS anon_update,
    has_table_privilege('anon', c.oid, 'DELETE')      AS anon_delete
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
ORDER BY c.relrowsecurity, c.relname;

-- 2) 정책 목록 — 🚩 anon/public 대상 INSERT·UPDATE·DELETE·ALL 정책이 있으면 쓰기 허용
SELECT tablename, policyname, cmd, roles, qual AS using_expr, with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, cmd;

-- 3) RLS 꺼진 테이블에 대한 anon/authenticated 권한 (가장 위험한 조합만)
SELECT g.table_name, g.grantee, string_agg(g.privilege_type, ', ' ORDER BY g.privilege_type) AS privileges
FROM information_schema.role_table_grants g
JOIN pg_class c ON c.relname = g.table_name
JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = g.table_schema
WHERE g.table_schema = 'public'
  AND g.grantee IN ('anon', 'authenticated')
  AND NOT c.relrowsecurity
GROUP BY g.table_name, g.grantee
ORDER BY g.table_name;

-- 4) voice_raw_posts 컬럼별 anon 읽기 권한
--    004 적용 후 기대값: id, title, url, board_name, posted_at, sentiment, issue_summary, classified_at만 true
SELECT a.attname AS column_name,
       has_column_privilege('anon', 'public.voice_raw_posts', a.attname, 'SELECT') AS anon_can_select
FROM pg_attribute a
WHERE a.attrelid = 'public.voice_raw_posts'::regclass AND a.attnum > 0 AND NOT a.attisdropped
ORDER BY a.attnum;

-- 5) 뷰 — 기본 뷰는 소유자 권한으로 실행돼 RLS를 우회한다 (security_invoker 아니면 🚩)
SELECT c.relname AS view_name,
       coalesce((SELECT option_value FROM pg_options_to_table(c.reloptions)
                 WHERE option_name = 'security_invoker'), 'false') AS security_invoker,
       has_table_privilege('anon', c.oid, 'SELECT') AS anon_select
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('v', 'm');

-- 6) anon이 실행 가능한 SECURITY DEFINER 함수 (RPC로 호출 가능 → RLS 우회 경로 🚩)
SELECT p.proname AS function_name, pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prosecdef
  AND has_function_privilege('anon', p.oid, 'EXECUTE');
