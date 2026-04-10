'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { usersApi, type AdminAccount } from '@/lib/api'
import type { User } from '@/types'
import { getStoredToken, getAdminRole } from '@/lib/firebase'
import AdminHeader from '@/components/AdminHeader'

const inputStyle: React.CSSProperties = {
  background: 'var(--bg-base)',
  color: 'var(--text-main)',
  border: '1px solid var(--border-gold)',
  borderRadius: '6px',
  padding: '8px 14px',
  fontSize: '14px',
  fontFamily: 'inherit',
}

const primaryBtnStyle: React.CSSProperties = {
  background: 'var(--gold-mid)',
  color: 'var(--bg-base)',
  fontWeight: '700',
  padding: '8px 24px',
  borderRadius: '6px',
  border: 'none',
  cursor: 'pointer',
  fontSize: '14px',
  fontFamily: 'inherit',
}

export default function AdminUsersPage() {
  const router = useRouter()
  const [users, setUsers] = useState<User[]>([])
  const [newEmail, setNewEmail] = useState('')
  const [newNickname, setNewNickname] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null)
  const [editingNicknames, setEditingNicknames] = useState<Record<number, string>>({})
  const [nicknameSaving, setNicknameSaving] = useState<Record<number, boolean>>({})

  useEffect(() => {
    if (!getStoredToken() || getAdminRole() !== 'super') {
      router.push('/admin/notice')
      return
    }
    loadUsers()
  }, [])

  async function loadUsers() {
    setLoading(true)
    try {
      setUsers(await usersApi.getAll())
    } finally {
      setLoading(false)
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!newEmail.trim() || !newNickname.trim()) return
    setSaving(true)
    setMessage(null)
    try {
      const res = await usersApi.create(newEmail.trim(), newNickname.trim())
      if (res.ok) {
        setMessage({ text: `"${newNickname.trim()}" (${newEmail.trim()}) 사용자가 등록되었습니다. 가입 안내 메일이 전송되었습니다.` })
        setNewEmail('')
        setNewNickname('')
        await loadUsers()
      } else {
        const body = await res.json() as { error: string }
        setMessage({ text: body.error ?? '오류가 발생했습니다.', error: true })
      }
    } catch {
      setMessage({ text: '오류가 발생했습니다.', error: true })
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: number, email: string) {
    if (!confirm(`"${email}" 사용자를 삭제하시겠습니까?`)) return
    await usersApi.delete(id)
    await loadUsers()
    setMessage({ text: `"${email}" 사용자가 삭제되었습니다.` })
    setTimeout(() => setMessage(null), 3000)
  }

  async function saveNickname(user: User) {
    const nickname = editingNicknames[user.id]
    if (!nickname?.trim()) return
    setNicknameSaving((prev) => ({ ...prev, [user.id]: true }))
    try {
      const res = await usersApi.updateNickname(user.id, nickname.trim())
      if (res.ok) {
        setUsers((prev) => prev.map((u) => u.id === user.id ? { ...u, nickname: nickname.trim() } : u))
        setEditingNicknames((prev) => { const next = { ...prev }; delete next[user.id]; return next })
        setMessage({ text: '닉네임이 수정되었습니다.' })
        setTimeout(() => setMessage(null), 3000)
      } else {
        setMessage({ text: '닉네임 저장에 실패했습니다.', error: true })
      }
    } finally {
      setNicknameSaving((prev) => ({ ...prev, [user.id]: false }))
    }
  }

  return (
    <div className="space-y-8 max-w-2xl mx-auto">
      <AdminHeader title="일반 사용자 관리" subtitle="최고 관리자 전용" />

      {/* 안내 */}
      <div className="rounded-lg p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-dark)' }}>
        <p className="text-sm" style={{ color: 'var(--text-sub)', lineHeight: 1.7 }}>
          👤 <strong style={{ color: 'var(--text-main)' }}>일반 사용자</strong>는 구글 계정으로 로그인하여 공지사항·이벤트·사진첩에 <strong style={{ color: 'var(--gold-mid)' }}>댓글</strong>을 달 수 있습니다.<br />
          등록 즉시 해당 구글 메일로 <strong>가입 완료 안내 메일</strong>이 자동 발송됩니다.<br />
          <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
            ※ 이메일 전송 기능은 RESEND_API_KEY 환경변수가 설정된 경우에만 동작합니다.
          </span>
        </p>
      </div>

      {/* 피드백 메시지 */}
      {message && (
        <p className="text-sm px-1" style={{ color: message.error ? '#e05050' : 'var(--gold-mid)' }}>
          {message.text}
        </p>
      )}

      {/* 사용자 추가 폼 */}
      <form onSubmit={handleAdd} className="space-y-3 rounded-lg p-6"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border-gold)' }}>
        <h2 className="text-base font-semibold" style={{ color: 'var(--text-main)' }}>일반 사용자 등록</h2>
        <div className="space-y-2">
          <input
            type="email"
            placeholder="Google 계정 이메일"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            required
            style={{ ...inputStyle, width: '100%' }}
          />
          <div className="flex gap-3">
            <input
              type="text"
              placeholder="닉네임"
              value={newNickname}
              onChange={(e) => setNewNickname(e.target.value)}
              required
              maxLength={30}
              style={{ ...inputStyle, flex: 1 }}
            />
            <button
              type="submit"
              disabled={saving}
              style={{ ...primaryBtnStyle, whiteSpace: 'nowrap', opacity: saving ? 0.5 : 1 }}
            >
              {saving ? '등록 중...' : '등록 + 메일 발송'}
            </button>
          </div>
        </div>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          등록 후 해당 이메일로 로그인 안내 메일이 자동 발송됩니다.
        </p>
      </form>

      {/* 사용자 목록 */}
      <div className="space-y-4">
        <h2 className="text-base font-semibold" style={{ color: 'var(--text-main)' }}>
          등록된 일반 사용자 ({users.length}명)
        </h2>
        {loading ? (
          <p className="text-center py-4" style={{ color: 'var(--text-muted)' }}>불러오는 중...</p>
        ) : users.length === 0 ? (
          <p className="text-center py-4" style={{ color: 'var(--text-muted)' }}>등록된 사용자가 없습니다.</p>
        ) : (
          users.map((user) => {
            const currentNickname = editingNicknames[user.id] ?? user.nickname
            const isDirty = user.id in editingNicknames && editingNicknames[user.id] !== user.nickname
            const isSaving = nicknameSaving[user.id] ?? false

            return (
              <div
                key={user.id}
                className="rounded-lg p-4 space-y-3"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border-dark)' }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p style={{ color: 'var(--text-main)', fontSize: '14px', fontWeight: 600 }}>
                      {user.email}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      등록일: {user.created_at.slice(0, 10)} · 등록자: {user.added_by}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDelete(user.id, user.email)}
                    className="text-xs shrink-0"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontFamily: 'inherit' }}
                    onMouseEnter={e => (e.currentTarget.style.color = '#e05050')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
                  >
                    삭제
                  </button>
                </div>

                {/* 닉네임 편집 */}
                <div className="space-y-1">
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>닉네임</p>
                  <div className="flex gap-2 items-center">
                    <input
                      type="text"
                      value={currentNickname}
                      onChange={(e) =>
                        setEditingNicknames((prev) => ({ ...prev, [user.id]: e.target.value }))
                      }
                      maxLength={30}
                      style={{ ...inputStyle, flex: 1, padding: '5px 10px', fontSize: '13px' }}
                    />
                    {isDirty && (
                      <>
                        <button
                          onClick={() => saveNickname(user)}
                          disabled={isSaving}
                          style={{ ...primaryBtnStyle, padding: '5px 14px', fontSize: '12px', whiteSpace: 'nowrap', opacity: isSaving ? 0.5 : 1 }}
                        >
                          {isSaving ? '저장 중...' : '저장'}
                        </button>
                        <button
                          onClick={() =>
                            setEditingNicknames((prev) => { const next = { ...prev }; delete next[user.id]; return next })
                          }
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '12px', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
                        >
                          취소
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
