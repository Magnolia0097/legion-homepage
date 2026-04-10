'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { memberApi, memberBioApi } from '@/lib/api'
import { getStoredToken, getAdminRole, getAdminNickname } from '@/lib/firebase'
import AdminHeader from '@/components/AdminHeader'
import RichTextEditor, { migrateContent, renderHtml } from '@/components/RichTextEditor'
import type { Member } from '@/types'

const ROLES = ['군단장', '엘리트장교', '명예장교', '군단병']

interface FormState {
  nickname: string
  role: string
  bio: string
}

const EMPTY_FORM: FormState = { nickname: '', role: '군단병', bio: '' }

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

const ghostBtnStyle: React.CSSProperties = {
  background: 'none',
  color: 'var(--text-muted)',
  border: 'none',
  cursor: 'pointer',
  padding: '8px 16px',
  fontSize: '14px',
  fontFamily: 'inherit',
}

export default function AdminMembersPage() {
  const router = useRouter()
  const [members, setMembers] = useState<Member[]>([])
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [editId, setEditId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [myNickname, setMyNickname] = useState('')

  // 일반 관리자용 bio 인라인 편집 상태
  const [bioEditId, setBioEditId] = useState<number | null>(null)
  const [bioEditValue, setBioEditValue] = useState('')
  const [bioSaving, setBioSaving] = useState(false)

  useEffect(() => {
    if (!getStoredToken()) {
      router.push('/admin/login')
      return
    }
    const role = getAdminRole()
    setIsSuperAdmin(role === 'super')
    if (role !== 'super') setMyNickname(getAdminNickname())
    loadMembers()
  }, [])

  async function loadMembers() {
    setLoading(true)
    try {
      setMembers(await memberApi.getAll())
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    // 중복 닉네임 체크 (수정 시에는 자기 자신 제외)
    const duplicate = members.find(
      (m) => m.nickname.trim() === form.nickname.trim() && m.id !== editId
    )
    if (duplicate) {
      setMessage(`이미 '${duplicate.nickname}' 닉네임의 멤버가 존재합니다.`)
      return
    }
    setSaving(true)
    setMessage(null)
    try {
      if (editId !== null) {
        await memberApi.update(editId, form)
        setMessage('멤버가 수정되었습니다.')
      } else {
        await memberApi.create(form)
        setMessage('멤버가 추가되었습니다.')
      }
      setForm(EMPTY_FORM)
      setEditId(null)
      await loadMembers()
    } catch {
      setMessage('오류가 발생했습니다.')
    } finally {
      setSaving(false)
    }
  }

  function handleEdit(member: Member) {
    setEditId(member.id)
    setForm({ nickname: member.nickname, role: member.role, bio: member.bio ?? '' })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleDelete(id: number) {
    if (!confirm('정말 삭제하시겠습니까?')) return
    await memberApi.delete(id)
    await loadMembers()
  }

  function handleBioEdit(member: Member) {
    setBioEditId(member.id)
    setBioEditValue(migrateContent(member.bio ?? ''))
  }

  async function handleBioSave(id: number) {
    setBioSaving(true)
    try {
      const res = await memberBioApi.update(id, bioEditValue)
      if (!res.ok) {
        const err = await res.json() as { error?: string }
        alert(`저장 실패 (${res.status}): ${err.error ?? '알 수 없는 오류'}`)
        return
      }
      setBioEditId(null)
      await loadMembers()
    } catch {
      alert('저장에 실패했습니다.')
    } finally {
      setBioSaving(false)
    }
  }

  const grouped = members.reduce<Record<string, Member[]>>((acc, m) => {
    ;(acc[m.role] ??= []).push(m)
    return acc
  }, {})

  return (
    <div className="space-y-8 max-w-2xl mx-auto">
      <AdminHeader
        title="멤버 관리"
        subtitle={!isSuperAdmin ? '일반 관리자 — 멤버 소개(bio) 수정만 가능합니다' : undefined}
      />

      {/* 최상위 관리자 전용: 추가/수정 폼 */}
      {isSuperAdmin && (
        <form onSubmit={handleSubmit} className="space-y-4 rounded-lg p-6"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-gold)' }}>
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-main)' }}>
            {editId !== null ? '멤버 수정' : '멤버 추가'}
          </h2>
          <div className="flex gap-3">
            <input
              type="text"
              placeholder="닉네임"
              value={form.nickname}
              onChange={(e) => setForm({ ...form, nickname: e.target.value })}
              required
              style={{ ...inputStyle, flex: 1 }}
            />
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              style={{ ...inputStyle, width: 'auto' }}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          <RichTextEditor
            value={form.bio}
            onChange={(html) => setForm({ ...form, bio: html })}
            placeholder="멤버 소개 (선택) — 홈 화면에서 닉네임에 마우스를 올리면 표시됩니다"
            minRows={2}
          />
          <div className="flex gap-3 items-center">
            <button type="submit" disabled={saving} style={{ ...primaryBtnStyle, opacity: saving ? 0.5 : 1 }}>
              {saving ? '저장 중...' : editId !== null ? '수정 완료' : '추가'}
            </button>
            {editId !== null && (
              <button type="button" onClick={() => { setEditId(null); setForm(EMPTY_FORM) }} style={ghostBtnStyle}>
                취소
              </button>
            )}
          </div>
          {message && <p className="text-sm" style={{ color: 'var(--gold-mid)' }}>{message}</p>}
        </form>
      )}

      {/* 멤버 목록 */}
      {loading ? (
        <p className="text-center py-4" style={{ color: 'var(--text-muted)' }}>불러오는 중...</p>
      ) : members.length === 0 ? (
        <p className="text-center py-4" style={{ color: 'var(--text-muted)' }}>등록된 멤버가 없습니다.</p>
      ) : (
        <div className="space-y-6">
          {ROLES.filter((r) => grouped[r]?.length).map((role) => (
            <div key={role}>
              <h3 className="text-xs tracking-widest mb-3 uppercase" style={{ color: 'var(--text-muted)' }}>{role}</h3>
              <div className="space-y-2">
                {grouped[role]?.map((member) => (
                  <div
                    key={member.id}
                    className="rounded-lg px-4 py-3"
                    style={{ background: 'var(--bg-card)', border: '1px solid var(--border-dark)' }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className="text-xs font-bold py-0.5 rounded shrink-0 text-center"
                          style={{ background: 'var(--border-gold)', color: 'var(--gold-mid)', width: '5.5rem' }}
                        >
                          {member.role}
                        </span>
                        <div className="min-w-0">
                          <span style={{ color: 'var(--text-main)' }}>{member.nickname}</span>
                          {member.bio && bioEditId !== member.id && (
                            <p
                              className="text-xs truncate mt-0.5"
                              style={{ color: 'var(--text-muted)' }}
                              dangerouslySetInnerHTML={{ __html: renderHtml(member.bio) }}
                            />
                          )}
                        </div>
                      </div>
                      <div className="flex gap-3 shrink-0">
                        {/* 소개 수정 버튼 (모든 관리자 — 자기 자신 제외) */}
                        {bioEditId !== member.id && (isSuperAdmin || member.nickname !== myNickname) && (
                          <button
                            onClick={() => handleBioEdit(member)}
                            className="text-xs"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-sub)', fontFamily: 'inherit' }}
                            onMouseEnter={e => (e.currentTarget.style.color = 'var(--gold-mid)')}
                            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-sub)')}
                          >
                            소개 수정
                          </button>
                        )}
                        {/* 수정/삭제 (최상위 관리자 전용) */}
                        {isSuperAdmin && (
                          <>
                            <button
                              onClick={() => handleEdit(member)}
                              className="text-xs"
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-sub)', fontFamily: 'inherit' }}
                              onMouseEnter={e => (e.currentTarget.style.color = 'var(--gold-mid)')}
                              onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-sub)')}
                            >
                              수정
                            </button>
                            <button
                              onClick={() => handleDelete(member.id)}
                              className="text-xs"
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontFamily: 'inherit' }}
                              onMouseEnter={e => (e.currentTarget.style.color = '#e05050')}
                              onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
                            >
                              삭제
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* 소개 인라인 편집 영역 */}
                    {bioEditId === member.id && (
                      <div className="mt-3 space-y-2">
                        <RichTextEditor
                          value={bioEditValue}
                          onChange={(html) => setBioEditValue(html)}
                          placeholder="멤버 소개를 입력하세요 (비워두면 삭제)"
                          minRows={2}
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleBioSave(member.id)}
                            disabled={bioSaving}
                            style={{ ...primaryBtnStyle, padding: '6px 18px', fontSize: '13px', opacity: bioSaving ? 0.5 : 1 }}
                          >
                            {bioSaving ? '저장 중...' : '저장'}
                          </button>
                          <button
                            onClick={() => setBioEditId(null)}
                            style={{ ...ghostBtnStyle, padding: '6px 14px', fontSize: '13px' }}
                          >
                            취소
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
