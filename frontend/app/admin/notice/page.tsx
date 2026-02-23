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
      <div className="flex items-center justify-between border-b border-gray-800 pb-4">
        <h1 className="text-2xl font-bold text-white">공지 관리</h1>
        <a href="/admin/gallery" className="text-sm text-gray-400 hover:text-white">사진 관리 →</a>
      </div>

      {/* 작성/수정 폼 */}
      <form onSubmit={handleSubmit} className="space-y-4 bg-gray-800 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-white">{editId !== null ? '공지 수정' : '공지 작성'}</h2>
        <input
          type="text"
          placeholder="제목"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          required
          className="w-full bg-gray-900 text-white px-4 py-2 rounded border border-gray-700 focus:border-amber-500 outline-none"
        />
        <textarea
          placeholder="내용"
          value={form.content}
          onChange={(e) => setForm({ ...form, content: e.target.value })}
          required
          rows={6}
          className="w-full bg-gray-900 text-white px-4 py-2 rounded border border-gray-700 focus:border-amber-500 outline-none resize-none"
        />
        <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
          <input
            type="checkbox"
            checked={form.is_pinned === 1}
            onChange={(e) => setForm({ ...form, is_pinned: e.target.checked ? 1 : 0 })}
          />
          상단 고정
        </label>
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={saving}
            className="bg-amber-500 text-black font-bold px-6 py-2 rounded hover:bg-amber-400 disabled:opacity-50"
          >
            {saving ? '저장 중...' : editId !== null ? '수정 완료' : '작성'}
          </button>
          {editId !== null && (
            <button
              type="button"
              onClick={() => { setEditId(null); setForm(EMPTY_FORM) }}
              className="text-gray-400 hover:text-white px-4 py-2"
            >
              취소
            </button>
          )}
        </div>
        {message && <p className="text-sm text-green-400">{message}</p>}
      </form>

      {/* 공지 목록 */}
      <div className="space-y-3">
        {loading ? (
          <p className="text-gray-500">불러오는 중...</p>
        ) : notices.length === 0 ? (
          <p className="text-gray-500">등록된 공지가 없습니다.</p>
        ) : (
          notices.map((notice) => (
            <div key={notice.id} className="flex items-center justify-between bg-gray-800 rounded-lg px-4 py-3">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                {notice.is_pinned === 1 && (
                  <span className="text-xs bg-amber-500 text-black font-bold px-2 py-0.5 rounded shrink-0">고정</span>
                )}
                <span className="text-white truncate">{notice.title}</span>
              </div>
              <div className="flex gap-2 ml-4 shrink-0">
                <button onClick={() => handleEdit(notice)} className="text-xs text-blue-400 hover:text-blue-300">수정</button>
                <button onClick={() => handleDelete(notice.id)} className="text-xs text-red-400 hover:text-red-300">삭제</button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
