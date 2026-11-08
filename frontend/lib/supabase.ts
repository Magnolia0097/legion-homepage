import { createClient } from '@supabase/supabase-js'

// 2026-11: 레거시 anon JWT 대신 publishable 키(sb_publishable_…)를 쓴다.
// 레거시 anon·service_role 키는 유출된 JWT secret으로 서명돼 있어 비활성화했다 (docs/SECURITY_NOTES.md).
// publishable 키는 원래 브라우저 번들에 그대로 들어가는 공개 키라 코드에 둔다.
// 접근 제어는 RLS·컬럼 GRANT가 맡는다 (supabase/migrations/004_restrict_anon_access.sql).
// Cloudflare Pages 환경변수 NEXT_PUBLIC_SUPABASE_ANON_KEY는 더 이상 쓰지 않는다.
const DEFAULT_URL = 'https://ospcbkfmsxludkoshcxt.supabase.co'
const PUBLISHABLE_KEY = 'sb_publishable_EV_vYXzDH4v6eJGCF-rq7w_Maf9mJ1Q' // gitleaks:allow (공개 키)

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_URL
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || PUBLISHABLE_KEY

export const supabase = url && key ? createClient(url, key) : null
