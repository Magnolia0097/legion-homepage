'use client'

import { useEffect, useState } from 'react'
import { commentApi } from '@/lib/api'
import { getStoredToken, isLoggedIn, getDisplayNickname } from '@/lib/firebase'
import type { Comment } from '@/types'

interface Props {
  targetType: 'notice' | 'event'
  targetId: number
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return '방금 전'
  if (minutes < 60) return `${minutes}분 전`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}시간 전`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}일 전`
  return new Date(dateStr).toLocaleDateString('ko-KR')
}

export default function CommentSection({ targetType, targetId }: Props) {
  const [comments, setComments] = useState<Comment[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [posting, setPosting] = useState(false)
  const [loggedIn, setLoggedIn] = useState(false)
  const [nickname, setNickname] = useState('')

  useEffect(() => {
    setLoggedIn(isLoggedIn())
    setNickname(getDisplayNickname())
    loadComments()
  }, [targetId])

  async function loadComments() {
    setLoading(true)
    try {
      setComments(await commentApi.getAll(targetType, targetId))
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim() || posting) return
    setPosting(true)
    try {
      const res = await commentApi.create(targetType, targetId, input.trim())
      if (res.ok) {
        const newComment = await res.json() as Comment
        setComments((prev) => [...prev, newComment])
        setInput('')
      }
    } finally {
      setPosting(false)
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('댓글을 삭제하시겠습니까?')) return
    const res = await commentApi.delete(id)
    if (res.ok) {
      setComments((prev) => prev.filter((c) => c.id !== id))
    }
  }

  return (
    <div className="space-y-4 pt-6" style={{ borderTop: '1px solid var(--border-dark)' }}>
      <h3 className="text-sm font-bold tracking-widest uppercase" style={{ color: 'var(--gold-mid)' }}>
        댓글 {comments.length > 0 && `(${comments.length})`}
      </h3>

      {/* 댓글 목록 */}
      {loading ? (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>불러오는 중...</p>
      ) : comments.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>첫 번째 댓글을 남겨보세요!</p>
      ) : (
        <div className="space-y-3">
          {comments.map((comment) => (
            <div
              key={comment.id}
              className="rounded-lg px-4 py-3"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border-dark)' }}
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-sm font-semibold" style={{ color: 'var(--gold-mid)' }}>
                  {comment.author_nickname}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {timeAgo(comment.created_at)}
                  </span>
                  {loggedIn && (
                    <button
                      onClick={() => handleDelete(comment.id)}
                      className="text-xs"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontFamily: 'inherit' }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#e05050')}
                      onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
                    >
                      삭제
                    </button>
                  )}
                </div>
              </div>
              <p className="text-sm" style={{ color: 'var(--text-sub)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {comment.content}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* 댓글 입력 */}
      {loggedIn ? (
        <form onSubmit={handleSubmit} className="space-y-2">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold" style={{ color: 'var(--gold-mid)' }}>{nickname}</span>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>로 댓글 작성</span>
          </div>
          <div className="flex gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="댓글을 입력하세요 (최대 500자)"
              maxLength={500}
              rows={2}
              style={{
                flex: 1,
                background: 'var(--bg-base)',
                color: 'var(--text-main)',
                border: '1px solid var(--border-gold)',
                borderRadius: '6px',
                padding: '8px 12px',
                fontSize: '13px',
                fontFamily: 'inherit',
                resize: 'none',
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSubmit(e as unknown as React.FormEvent)
                }
              }}
            />
            <button
              type="submit"
              disabled={posting || !input.trim()}
              style={{
                background: 'var(--gold-mid)',
                color: 'var(--bg-base)',
                fontWeight: 700,
                padding: '8px 16px',
                borderRadius: '6px',
                border: 'none',
                cursor: posting || !input.trim() ? 'not-allowed' : 'pointer',
                fontSize: '13px',
                fontFamily: 'inherit',
                opacity: posting || !input.trim() ? 0.5 : 1,
                alignSelf: 'flex-end',
                whiteSpace: 'nowrap',
              }}
            >
              {posting ? '...' : '등록'}
            </button>
          </div>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Enter로 등록 / Shift+Enter로 줄바꿈
          </p>
        </form>
      ) : (
        <div className="rounded-lg px-4 py-3 text-sm" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-dark)' }}>
          <span style={{ color: 'var(--text-muted)' }}>댓글 작성은 </span>
          <a href="/login" style={{ color: 'var(--gold-mid)', textDecoration: 'none', fontWeight: 600 }}>
            로그인
          </a>
          <span style={{ color: 'var(--text-muted)' }}> 후 이용할 수 있습니다.</span>
        </div>
      )}
    </div>
  )
}
