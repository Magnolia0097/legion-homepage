'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { adminAccountsApi, authApi, siteSettingsApi, ADMIN_PERMISSION_LABELS, type AdminAccount, type SiteSettings } from '@/lib/api'
import { getStoredToken, getAdminRole, getAdminNickname, setAdminNickname } from '@/lib/firebase'
import AdminHeader from '@/components/AdminHeader'

const ALL_PERMISSIONS = Object.keys(ADMIN_PERMISSION_LABELS) as string[]

const inputStyle: React.CSSProperties = {
  background: 'var(--bg-base)',
  color: 'var(--text-main)',
  border: '1px solid var(--border-gold)',
  borderRadius: '6px',
  padding: '8px 14px',
  fontSize: '14px',
  width: '100%',
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

export default function AdminAccountsPage() {
  const router = useRouter()
  const [accounts, setAccounts] = useState<AdminAccount[]>([])
  const [newEmail, setNewEmail] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null)
  // 권한 편집 중인 계정: { accountId → 현재 선택된 perms[] }
  const [editingPerms, setEditingPerms] = useState<Record<number, string[]>>({})
  const [permSaving, setPermSaving] = useState<Record<number, boolean>>({})
  // 사이트 설정 편집 상태
  const [siteSettings, setSiteSettings] = useState<SiteSettings>({ join_conditions: '', join_method: '', hero_enabled: '0' })
  const [editingSettings, setEditingSettings] = useState<Partial<SiteSettings>>({})
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [heroToggling, setHeroToggling] = useState(false)

  // 닉네임 편집 상태
  const [myNickname, setMyNickname] = useState('')
  const [myNicknameEditing, setMyNicknameEditing] = useState(false)
  const [myNicknameSaving, setMyNicknameSaving] = useState(false)
  const [editingNicknames, setEditingNicknames] = useState<Record<number, string>>({})
  const [nicknameSaving, setNicknameSaving] = useState<Record<number, boolean>>({})

  useEffect(() => {
    if (!getStoredToken() || getAdminRole() !== 'super') {
      router.push('/admin/notice')
      return
    }
    setMyNickname(getAdminNickname())
    loadAccounts()
    siteSettingsApi.get().then(setSiteSettings).catch(() => {})
  }, [])

  async function loadAccounts() {
    setLoading(true)
    try {
      setAccounts(await adminAccountsApi.getAll())
    } finally {
      setLoading(false)
    }
  }

  function parsePerms(account: AdminAccount): string[] {
    try { return JSON.parse(account.permissions) } catch { return [] }
  }

  function getPerms(account: AdminAccount): string[] {
    return editingPerms[account.id] ?? parsePerms(account)
  }

  function togglePerm(accountId: number, perm: string, currentPerms: string[]) {
    const next = currentPerms.includes(perm)
      ? currentPerms.filter((p) => p !== perm)
      : [...currentPerms, perm]
    setEditingPerms((prev) => ({ ...prev, [accountId]: next }))
  }

  async function savePerms(account: AdminAccount) {
    const perms = getPerms(account)
    setPermSaving((prev) => ({ ...prev, [account.id]: true }))
    try {
      const res = await adminAccountsApi.updatePermissions(account.id, perms)
      if (res.ok) {
        setAccounts((prev) =>
          prev.map((a) =>
            a.id === account.id ? { ...a, permissions: JSON.stringify(perms) } : a
          )
        )
        setEditingPerms((prev) => {
          const next = { ...prev }
          delete next[account.id]
          return next
        })
        setMessage({ text: `"${account.email}" 권한이 업데이트되었습니다.` })
        setTimeout(() => setMessage(null), 3000)
      } else {
        setMessage({ text: '권한 저장에 실패했습니다.', error: true })
      }
    } catch {
      setMessage({ text: '오류가 발생했습니다.', error: true })
    } finally {
      setPermSaving((prev) => ({ ...prev, [account.id]: false }))
    }
  }

  // ─── 사이트 설정 저장 ───
  async function saveSettings() {
    if (Object.keys(editingSettings).length === 0) return
    setSettingsSaving(true)
    try {
      const res = await siteSettingsApi.update(editingSettings)
      if (res.ok) {
        setSiteSettings((prev) => ({ ...prev, ...editingSettings }))
        setEditingSettings({})
        setMessage({ text: '가입 안내가 저장되었습니다.' })
        setTimeout(() => setMessage(null), 3000)
      } else {
        setMessage({ text: '저장에 실패했습니다.', error: true })
      }
    } catch {
      setMessage({ text: '오류가 발생했습니다.', error: true })
    } finally {
      setSettingsSaving(false)
    }
  }

  // ─── 이달의 모델 홈 노출 토글 ───
  async function toggleHero() {
    const next = siteSettings.hero_enabled === '1' ? '0' : '1'
    setHeroToggling(true)
    try {
      const res = await siteSettingsApi.update({ hero_enabled: next })
      if (res.ok) {
        setSiteSettings((prev) => ({ ...prev, hero_enabled: next }))
        setMessage({ text: next === '1' ? '이달의 모델이 홈에 공개되었습니다.' : '이달의 모델이 홈에서 숨겨졌습니다.' })
        setTimeout(() => setMessage(null), 3000)
      } else {
        setMessage({ text: '저장에 실패했습니다.', error: true })
      }
    } catch {
      setMessage({ text: '오류가 발생했습니다.', error: true })
    } finally {
      setHeroToggling(false)
    }
  }

  // ─── 내 닉네임 저장 (최상위 관리자 본인) ───
  async function saveMyNickname() {
    setMyNicknameSaving(true)
    try {
      const res = await authApi.updateOwnNickname(myNickname)
      if (res.ok) {
        setAdminNickname(myNickname)
        setMyNicknameEditing(false)
        setMessage({ text: '내 닉네임이 저장되었습니다.' })
        setTimeout(() => setMessage(null), 3000)
      } else {
        setMessage({ text: '닉네임 저장에 실패했습니다.', error: true })
      }
    } catch {
      setMessage({ text: '오류가 발생했습니다.', error: true })
    } finally {
      setMyNicknameSaving(false)
    }
  }

  // ─── 일반 관리자 닉네임 저장 ───
  async function saveNickname(account: AdminAccount) {
    const nickname = editingNicknames[account.id] ?? account.nickname
    setNicknameSaving((prev) => ({ ...prev, [account.id]: true }))
    try {
      const res = await adminAccountsApi.updateNickname(account.id, nickname)
      if (res.ok) {
        setAccounts((prev) =>
          prev.map((a) => a.id === account.id ? { ...a, nickname } : a)
        )
        setEditingNicknames((prev) => {
          const next = { ...prev }
          delete next[account.id]
          return next
        })
        setMessage({ text: `"${account.email}" 닉네임이 저장되었습니다.` })
        setTimeout(() => setMessage(null), 3000)
      } else {
        setMessage({ text: '닉네임 저장에 실패했습니다.', error: true })
      }
    } catch {
      setMessage({ text: '오류가 발생했습니다.', error: true })
    } finally {
      setNicknameSaving((prev) => ({ ...prev, [account.id]: false }))
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!newEmail.trim()) return
    setSaving(true)
    setMessage(null)
    try {
      const res = await adminAccountsApi.create(newEmail.trim())
      if (res.ok) {
        setMessage({ text: '관리자가 추가되었습니다.' })
        setNewEmail('')
        await loadAccounts()
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
    if (!confirm(`"${email}" 관리자 권한을 제거하시겠습니까?`)) return
    await adminAccountsApi.delete(id)
    await loadAccounts()
  }

  return (
    <div className="space-y-8 max-w-2xl mx-auto">
      <AdminHeader title="관리자 관리" subtitle="최상위 관리자 전용" />

      {/* 안내 카드 */}
      <div className="rounded-lg p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-dark)' }}>
        <p className="text-sm" style={{ color: 'var(--text-sub)' }}>
          👑 <strong style={{ color: 'var(--gold-light)' }}>최상위 관리자</strong> — 모든 기능 + 관리자 계정 관리<br />
          🗡️ <strong style={{ color: 'var(--text-main)' }}>일반 관리자</strong> — 아래에서 켜진 항목만 관리 가능 (실시간 반영)
        </p>
      </div>

      {/* 전역 피드백 메시지 */}
      {message && (
        <p className="text-sm px-1" style={{ color: message.error ? '#e05050' : 'var(--gold-mid)' }}>
          {message.text}
        </p>
      )}

      {/* ─── 이달의 모델 홈 노출 설정 ─── */}
      <div className="rounded-lg p-6"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border-gold)' }}>
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-base font-semibold" style={{ color: 'var(--text-main)' }}>✦ 이달의 모델 홈 노출</h2>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              켜면 홈 화면 최상단에 이달의 모델 히어로 섹션이 모든 방문자에게 표시됩니다.<br />
              꺼도 최상위 관리자는 항상 미리보기로 확인할 수 있습니다.
            </p>
          </div>
          <button
            onClick={toggleHero}
            disabled={heroToggling}
            style={{
              flexShrink: 0,
              width: 52,
              height: 28,
              borderRadius: 99,
              border: 'none',
              cursor: heroToggling ? 'wait' : 'pointer',
              background: siteSettings.hero_enabled === '1' ? 'var(--gold-mid)' : 'var(--border-dark)',
              position: 'relative',
              transition: 'background 0.2s',
              opacity: heroToggling ? 0.6 : 1,
            }}
          >
            <span style={{
              position: 'absolute',
              top: 3,
              left: siteSettings.hero_enabled === '1' ? 26 : 3,
              width: 22,
              height: 22,
              borderRadius: '50%',
              background: '#fff',
              transition: 'left 0.2s',
              boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
            }} />
          </button>
        </div>
        <p className="mt-3 text-xs font-semibold" style={{ color: siteSettings.hero_enabled === '1' ? 'var(--gold-mid)' : 'var(--text-muted)' }}>
          {siteSettings.hero_enabled === '1' ? '● 현재 공개 중' : '● 현재 숨김'}
        </p>
      </div>

      {/* ─── 가입 안내 설정 ─── */}
      <div className="rounded-lg p-6 space-y-4"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border-gold)' }}>
        <h2 className="text-base font-semibold" style={{ color: 'var(--text-main)' }}>📋 가입 안내 설정</h2>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          홈 화면에 표시되는 가입조건과 가입 방법 내용을 수정합니다.
        </p>

        {/* 가입 조건 */}
        <div className="space-y-1">
          <p className="text-xs font-semibold" style={{ color: 'var(--text-sub)' }}>가입 조건</p>
          <textarea
            rows={3}
            value={editingSettings.join_conditions ?? siteSettings.join_conditions}
            onChange={(e) => setEditingSettings((prev) => ({ ...prev, join_conditions: e.target.value }))}
            style={{
              ...inputStyle,
              resize: 'vertical',
              minHeight: '72px',
            }}
          />
        </div>

        {/* 가입 방법 */}
        <div className="space-y-1">
          <p className="text-xs font-semibold" style={{ color: 'var(--text-sub)' }}>가입 방법</p>
          <textarea
            rows={3}
            value={editingSettings.join_method ?? siteSettings.join_method}
            onChange={(e) => setEditingSettings((prev) => ({ ...prev, join_method: e.target.value }))}
            style={{
              ...inputStyle,
              resize: 'vertical',
              minHeight: '72px',
            }}
          />
        </div>

        {/* 저장/취소 */}
        {Object.keys(editingSettings).length > 0 && (
          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={saveSettings}
              disabled={settingsSaving}
              style={{ ...primaryBtnStyle, padding: '8px 20px', opacity: settingsSaving ? 0.5 : 1 }}
            >
              {settingsSaving ? '저장 중...' : '저장'}
            </button>
            <button
              onClick={() => setEditingSettings({})}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-muted)', fontFamily: 'inherit', fontSize: '14px',
              }}
            >
              취소
            </button>
          </div>
        )}
      </div>

      {/* ─── 내 닉네임 섹션 (최상위 관리자 본인) ─── */}
      <div className="rounded-lg p-6 space-y-3"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border-gold)' }}>
        <h2 className="text-base font-semibold" style={{ color: 'var(--text-main)' }}>👑 내 닉네임</h2>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          공지사항·이벤트 게시글의 작성자로 표시될 이름입니다. 미설정 시 &apos;관리자&apos;로 표시됩니다.
        </p>
        {myNicknameEditing ? (
          <div className="flex gap-2 items-center">
            <input
              type="text"
              value={myNickname}
              onChange={(e) => setMyNickname(e.target.value)}
              placeholder="닉네임 입력"
              maxLength={30}
              style={{ ...inputStyle, flex: 1 }}
            />
            <button
              onClick={saveMyNickname}
              disabled={myNicknameSaving}
              style={{ ...primaryBtnStyle, padding: '8px 18px', whiteSpace: 'nowrap', opacity: myNicknameSaving ? 0.5 : 1 }}
            >
              {myNicknameSaving ? '저장 중...' : '저장'}
            </button>
            <button
              onClick={() => { setMyNickname(getAdminNickname()); setMyNicknameEditing(false) }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontFamily: 'inherit', fontSize: '14px', whiteSpace: 'nowrap' }}
            >
              취소
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <span style={{ color: myNickname ? 'var(--text-main)' : 'var(--text-muted)', fontSize: '14px', fontWeight: myNickname ? 600 : 400 }}>
              {myNickname || '(미설정)'}
            </span>
            <button
              onClick={() => setMyNicknameEditing(true)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontFamily: 'inherit', fontSize: '13px' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--gold-mid)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
            >
              수정
            </button>
          </div>
        )}
      </div>

      {/* ─── 관리자 추가 폼 ─── */}
      <form onSubmit={handleAdd} className="space-y-3 rounded-lg p-6"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border-gold)' }}>
        <h2 className="text-base font-semibold" style={{ color: 'var(--text-main)' }}>일반 관리자 추가</h2>
        <div className="flex gap-3">
          <input
            type="email"
            placeholder="Google 계정 이메일"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            required
            style={{ ...inputStyle, flex: 1 }}
          />
          <button
            type="submit"
            disabled={saving}
            style={{ ...primaryBtnStyle, whiteSpace: 'nowrap', opacity: saving ? 0.5 : 1 }}
          >
            {saving ? '추가 중...' : '추가'}
          </button>
        </div>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          추가 시 기본으로 모든 권한이 부여됩니다. 추가 후 아래에서 개별 조정 가능합니다.
        </p>
      </form>

      {/* ─── 관리자 목록 ─── */}
      <div className="space-y-4">
        <h2 className="text-base font-semibold" style={{ color: 'var(--text-main)' }}>등록된 일반 관리자</h2>
        {loading ? (
          <p className="text-center py-4" style={{ color: 'var(--text-muted)' }}>불러오는 중...</p>
        ) : accounts.length === 0 ? (
          <p className="text-center py-4" style={{ color: 'var(--text-muted)' }}>등록된 일반 관리자가 없습니다.</p>
        ) : (
          accounts.map((account) => {
            const perms = getPerms(account)
            const savedPerms = parsePerms(account)
            const isDirty =
              JSON.stringify([...perms].sort()) !==
              JSON.stringify([...savedPerms].sort())
            const isSavingThis = permSaving[account.id] ?? false
            const currentNickname = editingNicknames[account.id] ?? account.nickname
            const isNicknameDirty = account.id in editingNicknames && editingNicknames[account.id] !== account.nickname
            const isSavingNickname = nicknameSaving[account.id] ?? false

            return (
              <div
                key={account.id}
                className="rounded-lg p-4 space-y-3"
                style={{ background: 'var(--bg-card)', border: isDirty ? '1px solid var(--border-gold)' : '1px solid var(--border-dark)' }}
              >
                {/* 헤더: 이메일 + 제거 */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p style={{ color: 'var(--text-main)', fontSize: '14px', fontWeight: 600 }}>
                      {account.email}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      추가일: {account.created_at.slice(0, 10)}
                      {account.added_by && ` · 추가자: ${account.added_by}`}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDelete(account.id, account.email)}
                    className="text-xs shrink-0"
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--text-muted)',
                      fontFamily: 'inherit',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.color = '#e05050')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
                  >
                    제거
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
                        setEditingNicknames((prev) => ({ ...prev, [account.id]: e.target.value }))
                      }
                      placeholder="닉네임 미설정 (공지/이벤트에 '관리자'로 표시)"
                      maxLength={30}
                      style={{
                        ...inputStyle,
                        flex: 1,
                        padding: '5px 10px',
                        fontSize: '13px',
                      }}
                    />
                    {isNicknameDirty && (
                      <>
                        <button
                          onClick={() => saveNickname(account)}
                          disabled={isSavingNickname}
                          style={{
                            ...primaryBtnStyle,
                            padding: '5px 14px',
                            fontSize: '12px',
                            whiteSpace: 'nowrap',
                            opacity: isSavingNickname ? 0.5 : 1,
                          }}
                        >
                          {isSavingNickname ? '저장 중...' : '저장'}
                        </button>
                        <button
                          onClick={() =>
                            setEditingNicknames((prev) => {
                              const next = { ...prev }
                              delete next[account.id]
                              return next
                            })
                          }
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: 'var(--text-muted)',
                            fontSize: '12px',
                            fontFamily: 'inherit',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          취소
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* 세부 권한 토글 */}
                <div className="space-y-2">
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>세부 권한</p>
                  <div className="flex flex-wrap gap-2">
                    {ALL_PERMISSIONS.map((perm) => {
                      const active = perms.includes(perm)
                      return (
                        <button
                          key={perm}
                          type="button"
                          onClick={() => togglePerm(account.id, perm, perms)}
                          style={{
                            padding: '4px 14px',
                            borderRadius: '99px',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                            border: active
                              ? '1.5px solid var(--gold-mid)'
                              : '1px solid var(--border-dark)',
                            background: active
                              ? 'rgba(212,160,23,0.13)'
                              : 'transparent',
                            color: active
                              ? 'var(--gold-mid)'
                              : 'var(--text-muted)',
                            transition: 'all 0.15s',
                          }}
                        >
                          {active ? '✓ ' : ''}{ADMIN_PERMISSION_LABELS[perm]}
                        </button>
                      )
                    })}
                  </div>

                  {/* 변경사항 있을 때만 저장/취소 노출 */}
                  {isDirty && (
                    <div className="flex items-center gap-3 pt-1">
                      <button
                        type="button"
                        onClick={() => savePerms(account)}
                        disabled={isSavingThis}
                        style={{
                          ...primaryBtnStyle,
                          padding: '5px 16px',
                          fontSize: '12px',
                          opacity: isSavingThis ? 0.5 : 1,
                        }}
                      >
                        {isSavingThis ? '저장 중...' : '권한 저장'}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setEditingPerms((prev) => {
                            const next = { ...prev }
                            delete next[account.id]
                            return next
                          })
                        }
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: 'var(--text-muted)',
                          fontSize: '12px',
                          fontFamily: 'inherit',
                        }}
                      >
                        취소
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
