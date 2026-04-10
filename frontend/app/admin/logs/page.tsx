'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { adminLogsApi, type AdminLog } from '@/lib/api'
import { getStoredToken, getAdminRole } from '@/lib/firebase'
import AdminHeader from '@/components/AdminHeader'

// ─── 표시용 설정 ───
const ACTION_LABEL: Record<string, string> = {
  create: '추가',
  update: '수정',
  delete: '삭제',
  patch:  '변경',
}

const ACTION_COLOR: Record<string, string> = {
  create: '#4caf82',
  update: '#d4a017',
  delete: '#e05050',
  patch:  '#6a9fd8',
}

const TARGET_LABEL: Record<string, string> = {
  notice:        '공지',
  event:         '이벤트',
  event_photo:   '이벤트 사진',
  member:        '멤버',
  gallery:       '사진첩',
  admin_account: '관리자 계정',
}

function formatDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  })
}

export default function AdminLogsPage() {
  const router = useRouter()
  const [logs, setLogs] = useState<AdminLog[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!getStoredToken() || getAdminRole() !== 'super') {
      router.push('/admin/login')
      return
    }
    adminLogsApi.getAll(300)
      .then(setLogs)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <AdminHeader title="활동 로그" subtitle="최상위 관리자 전용 — 최근 300건" />

      {loading ? (
        <p className="text-center py-8" style={{ color: 'var(--text-muted)' }}>불러오는 중...</p>
      ) : logs.length === 0 ? (
        <p className="text-center py-8" style={{ color: 'var(--text-muted)' }}>기록된 활동이 없습니다.</p>
      ) : (
        <div className="space-y-1.5">
          {logs.map((log) => (
            <div
              key={log.id}
              className="flex items-start gap-3 rounded-lg px-4 py-3 text-sm"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border-dark)' }}
            >
              {/* 날짜 */}
              <span
                className="shrink-0 text-xs"
                style={{ color: 'var(--text-muted)', minWidth: '130px', paddingTop: '1px' }}
              >
                {formatDate(log.created_at)}
              </span>

              {/* 닉네임 (없으면 이메일 @ 앞부분) */}
              <span
                className="shrink-0 text-xs font-semibold truncate"
                style={{ color: 'var(--gold-mid)', maxWidth: '120px', paddingTop: '1px' }}
                title={log.admin_email}
              >
                {log.admin_nickname ?? log.admin_email.split('@')[0]}
              </span>

              {/* 액션 뱃지 */}
              <span
                className="shrink-0 text-xs font-bold px-2 py-0.5 rounded"
                style={{
                  background: `${ACTION_COLOR[log.action]}22`,
                  color: ACTION_COLOR[log.action],
                  border: `1px solid ${ACTION_COLOR[log.action]}55`,
                }}
              >
                {ACTION_LABEL[log.action] ?? log.action}
              </span>

              {/* 대상 타입 */}
              <span
                className="shrink-0 text-xs px-2 py-0.5 rounded"
                style={{
                  background: 'var(--border-dark)',
                  color: 'var(--text-sub)',
                }}
              >
                {TARGET_LABEL[log.target_type] ?? log.target_type}
              </span>

              {/* 상세 */}
              {log.detail && (
                <span
                  className="text-xs truncate"
                  style={{ color: 'var(--text-main)' }}
                  title={log.detail}
                >
                  {log.detail}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
