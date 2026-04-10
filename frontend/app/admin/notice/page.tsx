'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { noticeApi } from '@/lib/api'
import { getStoredToken } from '@/lib/firebase'
import AdminHeader from '@/components/AdminHeader'
import RichTextEditor, { migrateContent } from '@/components/RichTextEditor'
import type { Notice } from '@/types'

interface FormState {
  title: string
  content: string
  is_pinned: number
}

const EMPTY_FORM: FormState = { title: '', content: '', is_pinned: 0 }

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

export default function AdminNoticePage() {
  const router = useRouter()
  const [notices, setNotices] = useState<Notice[]>([])
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [editId, setEditId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  // 음악 관련 상태
  const musicRef = useRef<HTMLInputElement>(null)
  const [pendingMusicFile, setPendingMusicFile] = useState<File | null>(null)
  const [deleteMusicOnSave, setDeleteMusicOnSave] = useState(false)

  // 현재 수정 중인 공지의 music_key
  const editingNotice = editId !== null ? notices.find(n => n.id === editId) : null
  const hasExistingMusic = !!editingNotice?.music_key && !deleteMusicOnSave

  useEffect(() => {
    if (!getStoredToken()) {
      router.push('/admin/login')
      return
    }
    loadNotices()
  }, [])

  async function loadNotices() {
    setLoading(true)
    try {
      setNotices(await noticeApi.getAll())
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const plainText = form.content.replace(/<[^>]*>/g, '').trim()
    if (!plainText) { setMessage('내용을 입력해주세요.'); return }
    setSaving(true)
    setMessage(null)
    try {
      let noticeId: number
      if (editId !== null) {
        await noticeApi.update(editId, form)
        noticeId = editId
        setMessage('공지가 수정되었습니다.')
      } else {
        const res = await noticeApi.create({ ...form, author: '관리자' })
        if (!res.ok) throw new Error('공지 작성 실패')
        const data = await res.json() as { id: number }
        noticeId = data.id
        setMessage('공지가 작성되었습니다.')
      }

      // 음악 처리: 삭제 → 업로드 순
      if (deleteMusicOnSave) await noticeApi.deleteMusic(noticeId)
      if (pendingMusicFile) {
        const fd = new FormData()
        fd.append('file', pendingMusicFile, pendingMusicFile.name)
        await noticeApi.uploadMusic(noticeId, fd)
      }

      setPendingMusicFile(null)
      setDeleteMusicOnSave(false)
      setForm(EMPTY_FORM)
      setEditId(null)
      await loadNotices()
    } catch {
      setMessage('오류가 발생했습니다.')
    } finally {
      setSaving(false)
    }
  }

  function handleEdit(notice: Notice) {
    setEditId(notice.id)
    setForm({
      title: notice.title,
      content: migrateContent(notice.content),
      is_pinned: notice.is_pinned,
    })
    setPendingMusicFile(null)
    setDeleteMusicOnSave(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleDelete(id: number) {
    if (!confirm('정말 삭제하시겠습니까?')) return
    await noticeApi.delete(id)
    await loadNotices()
  }

  return (
    <div className="space-y-8 max-w-2xl mx-auto">
      <AdminHeader title="공지 관리" />

      {/* 작성/수정 폼 */}
      <form onSubmit={handleSubmit} className="space-y-4 rounded-lg p-6"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border-gold)' }}>
        <h2 className="text-base font-semibold" style={{ color: 'var(--text-main)' }}>
          {editId !== null ? '공지 수정' : '공지 작성'}
        </h2>
        <input
          type="text"
          placeholder="제목"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          required
          style={inputStyle}
        />
        <RichTextEditor
          value={form.content}
          onChange={(html) => setForm({ ...form, content: html })}
          placeholder="내용을 입력하세요"
          minRows={6}
        />
        <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--text-sub)' }}>
          <input
            type="checkbox"
            checked={form.is_pinned === 1}
            onChange={(e) => setForm({ ...form, is_pinned: e.target.checked ? 1 : 0 })}
            style={{ accentColor: 'var(--gold-mid)' }}
          />
          상단 고정
        </label>

        {/* 음악 첨부 */}
        <div className="space-y-2 rounded-lg p-4"
          style={{ background: 'var(--bg-base)', border: '1px solid var(--border-dark)' }}>
          <p className="text-xs font-semibold" style={{ color: 'var(--text-sub)' }}>
            🎵 음악 첨부 <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(선택 · MP3, OGG 등)</span>
          </p>

          {/* 기존 음악 표시 (수정 모드) */}
          {hasExistingMusic && (
            <div className="flex items-center gap-2">
              <span className="text-xs" style={{ color: 'var(--gold-mid)' }}>♪ 현재 음악 첨부됨</span>
              <button
                type="button"
                onClick={() => { setDeleteMusicOnSave(true); setPendingMusicFile(null) }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '11px', color: '#e05050', fontFamily: 'inherit', padding: '0 4px' }}
              >
                삭제
              </button>
            </div>
          )}

          {/* 선택된 새 파일 표시 */}
          {pendingMusicFile ? (
            <div className="flex items-center gap-2">
              <span className="text-xs truncate" style={{ color: 'var(--text-main)' }}>
                ♪ {pendingMusicFile.name}
              </span>
              <button
                type="button"
                onClick={() => { setPendingMusicFile(null); if (musicRef.current) musicRef.current.value = ''; if (editingNotice?.music_key) setDeleteMusicOnSave(false) }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'inherit', padding: '0 4px', flexShrink: 0 }}
              >
                취소
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => musicRef.current?.click()}
              style={{
                background: 'var(--bg-card)', color: 'var(--text-main)',
                border: '1px solid var(--border-gold)', borderRadius: '6px',
                padding: '5px 14px', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit',
              }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--gold-mid)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-gold)')}
            >
              {hasExistingMusic ? '♪ 음악 교체' : '♪ 음악 선택'}
            </button>
          )}

          <input
            ref={musicRef}
            type="file"
            accept="audio/*"
            style={{ display: 'none' }}
            onChange={e => {
              const file = e.target.files?.[0]
              if (!file) return
              setPendingMusicFile(file)
              // 기존 음악이 있으면 교체이므로 삭제 플래그 설정
              if (editingNotice?.music_key) setDeleteMusicOnSave(true)
            }}
          />
        </div>

        <div className="flex gap-3 items-center">
          <button type="submit" disabled={saving} style={{ ...primaryBtnStyle, opacity: saving ? 0.5 : 1 }}>
            {saving ? '저장 중...' : editId !== null ? '수정 완료' : '작성'}
          </button>
          {editId !== null && (
            <button type="button" onClick={() => { setEditId(null); setForm(EMPTY_FORM); setPendingMusicFile(null); setDeleteMusicOnSave(false) }} style={ghostBtnStyle}>
              취소
            </button>
          )}
        </div>
        {message && <p className="text-sm" style={{ color: 'var(--gold-mid)' }}>{message}</p>}
      </form>

      {/* 공지 목록 */}
      <div className="space-y-3">
        {loading ? (
          <p className="text-center py-4" style={{ color: 'var(--text-muted)' }}>불러오는 중...</p>
        ) : notices.length === 0 ? (
          <p className="text-center py-4" style={{ color: 'var(--text-muted)' }}>등록된 공지가 없습니다.</p>
        ) : (
          notices.map((notice) => (
            <div
              key={notice.id}
              className="flex items-center justify-between rounded-lg px-4 py-3"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border-dark)' }}
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                {notice.is_pinned === 1 && (
                  <span className="text-xs font-bold px-2 py-0.5 rounded shrink-0"
                    style={{ background: 'var(--gold-mid)', color: 'var(--bg-base)' }}>
                    고정
                  </span>
                )}
                <span className="truncate" style={{ color: 'var(--text-main)' }}>{notice.title}</span>
              </div>
              <div className="flex gap-2 ml-4 shrink-0">
                <button onClick={() => handleEdit(notice)}
                  className="text-xs"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-sub)', fontFamily: 'inherit' }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--gold-mid)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-sub)')}>
                  수정
                </button>
                <button onClick={() => handleDelete(notice.id)}
                  className="text-xs"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontFamily: 'inherit' }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#e05050')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}>
                  삭제
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
