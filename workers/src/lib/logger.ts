import type { D1Database } from '@cloudflare/workers-types'

export type ActionType = 'create' | 'update' | 'delete' | 'patch'
export type TargetType = 'notice' | 'event' | 'event_photo' | 'member' | 'gallery' | 'admin_account'

interface LogOptions {
  db: D1Database
  adminEmail: string
  action: ActionType
  targetType: TargetType
  targetId?: number | null
  detail?: string
}

// 로그 기록 (실패해도 메인 기능에 영향 없도록 무시)
export async function writeLog(opts: LogOptions): Promise<void> {
  try {
    await opts.db.prepare(
      `INSERT INTO admin_logs (admin_email, action, target_type, target_id, detail)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(
      opts.adminEmail,
      opts.action,
      opts.targetType,
      opts.targetId ?? null,
      opts.detail ?? null,
    ).run()
  } catch {
    // 로그 저장 실패는 무시
  }
}
