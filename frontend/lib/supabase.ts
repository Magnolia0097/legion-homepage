import { createClient } from '@supabase/supabase-js'
// 스키마 타입(supabase/types.ts)을 클라이언트에 주입 → 컬럼명/테이블 오타를 빌드 타임에 검출.
// type-only import라 번들에는 포함되지 않음(정적 export 영향 없음).
import type { Database } from '@db/types'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export const supabase = url && key ? createClient<Database>(url, key) : null
