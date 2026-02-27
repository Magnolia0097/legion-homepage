'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { noticeApi } from '@/lib/api'
import { getStoredToken } from '@/lib/firebase'
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
    setSaving(true)
    setMessage(null)
    try {
      if (editId !== null) {
        await noticeApi.update(editId, form)
        setMessage('공지가 수정되었습니다.')
      } else {
        await noticeApi.create({ ...form, author: '관리자' })
        setMessage('공지가 작성되었습니다.')
      }
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
    setForm({ title: notice.title, content: notice.content, is_pinned: notice.is_pinned })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleDelete(id: number) {
    if (!confirm('정말 삭제하시겠습니까?')) return
    await noticeApi.delete(id)
    await loadNotices()
  }

  return (
    <div className="space-y-8 max-w-2xl">
      {/* 헤더 */}
      <div className="flex items-center justify-between pb-4" style={{ borderBottom: '1px solid var(--border-dark)' }}>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-main)' }}>공지 관리</h1>
        <a href="/admin/gallery" style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '14px' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--gold-mid)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}>
          사진 관리 →
        </a>
      </div>

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
        <textarea
          placeholder="내용"
          value={form.content}
          onChange={(e) => setForm({ ...form, content: e.target.value })}
          required
          rows={6}
          style={{ ...inputStyle, resize: 'none' }}
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
        <div className="flex gap-3 items-center">
          <button type="submit" disabled={saving} style={{ ...primaryBtnStyle, opacity: saving ? 0.5 : 1 }}>
            {saving ? '저장 중...' : editId !== null ? '수정 완료' : '작성'}
          </button>
          {editId !== null && (
            <button type="button" onClick={() => { setEditId(null); setForm(EMPTY_FORM) }} style={ghostBtnStyle}>
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
