'use client'

import { useEffect, useState, Suspense, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { galleryApi, commentApi, likeApi, getImageUrl } from '@/lib/api'
import type { GalleryMonth, Photo, Comment } from '@/types'
import { isLoggedIn, getDisplayNickname, getAdminRole } from '@/lib/firebase'

function SectionTitle({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 mb-6">
      <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, transparent, var(--border-gold))' }} />
      <span className="text-xs font-bold tracking-widest uppercase" style={{ color: 'var(--gold-mid)' }}>
        {label}
      </span>
      <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, var(--border-gold), transparent)' }} />
    </div>
  )
}

// ── 최고관리자 전용 섹션 헤더 ──
function SuperSectionHeader({ label }: { label: string }) {
  return (
    <div style={{
      textAlign: 'center',
      padding: '32px 0 28px',
      borderBottom: '1px solid var(--border-gold)',
      marginBottom: '32px',
    }}>
      <div style={{ fontSize: '0.62rem', letterSpacing: '0.3em', color: 'var(--gold-dark)', marginBottom: '6px' }}>✦ ─────── ✦</div>
      <div style={{ fontSize: '0.68rem', letterSpacing: '0.42em', color: 'var(--gold-mid)', marginBottom: '3px' }}>성심당</div>
      <div style={{ fontSize: '0.52rem', letterSpacing: '0.32em', color: 'var(--text-muted)', marginBottom: '18px' }}>A&nbsp;I&nbsp;O&nbsp;N&nbsp;&nbsp;2</div>
      <h1 style={{
        fontSize: '2rem', fontWeight: 800,
        color: 'var(--text-main)', letterSpacing: '0.06em', marginBottom: '6px',
      }}>{label}</h1>
      <div style={{ fontSize: '0.62rem', letterSpacing: '0.3em', color: 'var(--gold-dark)', marginTop: '10px' }}>✦ ─────── ✦</div>
    </div>
  )
}

function formatYearMonth(ym: string): string {
  const [year, month] = ym.split('-')
  return `${year}년 ${parseInt(month)}월`
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

// ─── 사진 뷰어 모달 (유튜브 쇼츠 스타일) ───
function PhotoViewerModal({
  photos,
  initialIndex,
  initialShowComments,
  onClose,
}: {
  photos: Photo[]
  initialIndex: number
  initialShowComments: boolean
  onClose: () => void
}) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  const photo = photos[currentIndex]

  const [comments, setComments] = useState<Comment[]>([])
  const [input, setInput] = useState('')
  const [posting, setPosting] = useState(false)
  const [commentError, setCommentError] = useState<string | null>(null)
  const [loggedIn] = useState(() => isLoggedIn())
  const [nickname] = useState(() => getDisplayNickname())
  const [fullScreen, setFullScreen] = useState(false)
  const [showComments, setShowComments] = useState(initialShowComments)
  const [liked, setLiked] = useState(false)
  const [likeCount, setLikeCount] = useState(0)
  const [isMobile, setIsMobile] = useState(false)
  const commentsEndRef = useRef<HTMLDivElement>(null)

  const canPrev = currentIndex > 0
  const canNext = currentIndex < photos.length - 1

  function goPrev() { setCurrentIndex(i => Math.max(0, i - 1)) }
  function goNext() { setCurrentIndex(i => Math.min(photos.length - 1, i + 1)) }

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // photo가 바뀌면 likes/comments 다시 로드
  useEffect(() => {
    setComments([])
    setLikeCount(0)
    setLiked(false)
    commentApi.getAll('gallery', photo.id).then(setComments).catch(console.error)
    likeApi.get(photo.id).then(({ count, liked: l }) => { setLikeCount(count); setLiked(l) }).catch(console.error)
  }, [photo.id])

  // 낙관적 UI: 클릭 즉시 반영, 서버 응답으로 최종 동기화
  async function handleLike() {
    const prevLiked = liked
    const prevCount = likeCount
    // 즉시 UI 업데이트
    setLiked(!liked)
    setLikeCount(c => liked ? c - 1 : c + 1)
    try {
      const { count, liked: l } = await likeApi.toggle(photo.id)
      setLikeCount(count)
      setLiked(l)
    } catch (e) {
      // 실패 시 원래 값으로 복구
      setLiked(prevLiked)
      setLikeCount(prevCount)
      console.error(e)
    }
  }

  useEffect(() => {
    if (showComments) {
      setTimeout(() => commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 350)
    }
  }, [comments.length, showComments])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (fullScreen) setFullScreen(false)
        else if (showComments) setShowComments(false)
        else onClose()
      }
      if (e.key === 'ArrowLeft' && !fullScreen) goPrev()
      if (e.key === 'ArrowRight' && !fullScreen) goNext()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, fullScreen, showComments, currentIndex])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim() || posting) return
    setCommentError(null)
    setPosting(true)
    try {
      const res = await commentApi.create('gallery', photo.id, input.trim())
      if (res.ok) {
        const newComment = await res.json() as Comment
        setComments(prev => [...prev, newComment])
        setInput('')
      } else {
        const body = await res.json().catch(() => ({})) as { error?: string }
        if (res.status === 401 || res.status === 403) {
          setCommentError('댓글 작성 권한이 없습니다. 다시 로그인해 주세요.')
        } else {
          setCommentError(body.error ?? '댓글 등록에 실패했습니다.')
        }
      }
    } catch {
      setCommentError('네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.')
    } finally {
      setPosting(false)
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('댓글을 삭제하시겠습니까?')) return
    const res = await commentApi.delete(id)
    if (res.ok) setComments(prev => prev.filter(c => c.id !== id))
  }

  // 댓글 패널 내용 (모바일/데스크탑 공통)
  const commentPanel = (
    <>
      {/* 패널 헤더 */}
      <div style={{
        padding: '14px 18px 10px',
        borderBottom: '1px solid var(--border-dark)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-main)' }}>
          댓글{' '}
          <span style={{ color: 'var(--gold-mid)', fontWeight: 700 }}>{comments.length}</span>
        </span>
        <button
          onClick={() => setShowComments(false)}
          style={{
            background: 'var(--border-dark)', border: 'none',
            color: 'var(--text-sub)', cursor: 'pointer',
            width: '28px', height: '28px', borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px',
          }}
        >
          ✕
        </button>
      </div>

      {/* 댓글 목록 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {comments.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>첫 번째 댓글을 남겨보세요!</p>
        ) : (
          comments.map(comment => (
            <div key={comment.id}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--gold-mid)' }}>
                  {comment.author_nickname}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {timeAgo(comment.created_at)}
                  </span>
                  {loggedIn && (
                    <button
                      onClick={() => handleDelete(comment.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '11px', fontFamily: 'inherit' }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#e05050')}
                      onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
                    >
                      삭제
                    </button>
                  )}
                </div>
              </div>
              <p style={{ fontSize: '13px', marginTop: '3px', color: 'var(--text-sub)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {comment.content}
              </p>
            </div>
          ))
        )}
        <div ref={commentsEndRef} />
      </div>

      {/* 댓글 입력 */}
      <div style={{ padding: '10px 18px 14px', borderTop: '1px solid var(--border-dark)', flexShrink: 0 }}>
        {loggedIn ? (
          <form onSubmit={handleSubmit}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '7px' }}>
              <span style={{ color: 'var(--gold-mid)', fontWeight: 600 }}>{nickname}</span>로 댓글 작성
            </div>
            {/* 에러 메시지 */}
            {commentError && (
              <div style={{
                marginBottom: '7px', padding: '7px 10px', borderRadius: '6px',
                background: 'rgba(220,50,50,0.15)', border: '1px solid rgba(220,50,50,0.4)',
                color: '#ff8080', fontSize: '11px', lineHeight: 1.4,
              }}>
                ⚠ {commentError}
              </div>
            )}
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                value={input}
                onChange={e => { setInput(e.target.value); setCommentError(null) }}
                placeholder="댓글 입력..."
                maxLength={500}
                style={{
                  flex: 1, background: 'var(--border-dark)', color: 'var(--text-main)',
                  border: `1px solid ${commentError ? 'rgba(220,50,50,0.5)' : 'var(--border-gold)'}`,
                  borderRadius: '6px',
                  padding: '8px 10px', fontSize: '13px', fontFamily: 'inherit', outline: 'none',
                }}
              />
              <button
                type="submit"
                disabled={posting || !input.trim()}
                style={{
                  background: 'var(--gold-mid)', color: '#111', fontWeight: 700,
                  padding: '8px 14px', borderRadius: '6px', border: 'none',
                  cursor: posting || !input.trim() ? 'not-allowed' : 'pointer',
                  fontSize: '13px', fontFamily: 'inherit',
                  opacity: posting || !input.trim() ? 0.5 : 1, whiteSpace: 'nowrap',
                }}
              >
                {posting ? '...' : '등록'}
              </button>
            </div>
          </form>
        ) : (
          <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            댓글 작성은{' '}
            <a href="/login" style={{ color: 'var(--gold-mid)', fontWeight: 600, textDecoration: 'none' }}>
              로그인
            </a>
            {' '}후 이용할 수 있습니다.
          </p>
        )}
      </div>
    </>
  )

  // 액션 버튼 스타일
  const actionBtn = (active: boolean) => ({
    width: '46px', height: '46px', borderRadius: '50%',
    background: active ? 'rgba(212,160,23,0.22)' : 'var(--border-dark)',
    border: `1.5px solid ${active ? 'var(--gold-mid)' : 'var(--border-gold)'}`,
    cursor: 'pointer', fontSize: '20px',
    display: 'flex' as const, alignItems: 'center' as const, justifyContent: 'center' as const,
    transition: 'all 0.15s',
    color: active ? 'var(--gold-mid)' : 'var(--text-main)',
  })

  return (
    <>
      {/* 원본 전체화면 */}
      {fullScreen && (
        <div
          className="fixed inset-0 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.97)', zIndex: 300, cursor: 'zoom-out' }}
          onClick={() => setFullScreen(false)}
        >
          <img
            src={getImageUrl(photo.file_key)}
            alt={photo.description ?? ''}
            style={{ maxWidth: '100vw', maxHeight: '100vh', objectFit: 'contain', display: 'block' }}
            onClick={e => e.stopPropagation()}
          />
          <button
            onClick={() => setFullScreen(false)}
            style={{
              position: 'absolute', top: '16px', right: '16px',
              background: 'rgba(255,255,255,0.15)', border: 'none',
              color: '#fff', fontSize: '16px', borderRadius: '50%',
              width: '36px', height: '36px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            ✕
          </button>
          <p style={{ position: 'absolute', bottom: '20px', left: '50%', transform: 'translateX(-50%)', color: 'rgba(255,255,255,0.5)', fontSize: '12px', whiteSpace: 'nowrap' }}>
            클릭하거나 ESC로 닫기
          </p>
        </div>
      )}

      {/* 메인 뷰어 모달 */}
      <div
        className="fixed inset-0 flex items-center justify-center"
        style={{ background: 'rgba(0,0,0,0.9)', zIndex: 200 }}
        onClick={onClose}
      >
        <div
          style={{
            display: 'flex', flexDirection: 'row',
            maxWidth: '1000px', width: 'calc(100% - 32px)', height: '88vh',
          }}
          onClick={e => e.stopPropagation()}
        >
          {/* ── 사진 영역 ── */}
          <div style={{ flex: 1, position: 'relative', background: 'transparent', overflow: 'hidden', minWidth: 0 }}>
            <img
              src={getImageUrl(photo.file_key)}
              alt={photo.description ?? ''}
              onClick={() => setFullScreen(true)}
              style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', cursor: 'zoom-in' }}
            />

            {/* 닫기 버튼 */}
            <button
              onClick={onClose}
              style={{
                position: 'absolute', top: '12px', left: '12px',
                background: 'rgba(0,0,0,0.55)', border: 'none',
                color: '#fff', fontSize: '14px', borderRadius: '50%',
                width: '30px', height: '30px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10,
              }}
            >
              ✕
            </button>

            {/* 원본 힌트 */}
            <div style={{
              position: 'absolute', top: '12px', right: '12px',
              background: 'rgba(0,0,0,0.5)', color: 'rgba(255,255,255,0.55)',
              padding: '3px 9px', borderRadius: '20px', fontSize: '10px',
              pointerEvents: 'none', zIndex: 6,
            }}>
              🔍 원본 보기
            </div>

            {/* ← 이전 버튼 */}
            {canPrev && (
              <button
                onClick={e => { e.stopPropagation(); goPrev() }}
                style={{
                  position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)',
                  width: '42px', height: '42px', borderRadius: '50%',
                  background: 'rgba(0,0,0,0.55)', border: '1.5px solid var(--border-gold)',
                  color: '#fff', fontSize: '20px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  backdropFilter: 'blur(8px)', transition: 'all 0.15s', zIndex: 5,
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(212,160,23,0.4)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--gold-mid)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0.55)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-gold)' }}
              >
                ‹
              </button>
            )}
            {/* → 다음 버튼 */}
            {canNext && (
              <button
                onClick={e => { e.stopPropagation(); goNext() }}
                style={{
                  position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
                  width: '42px', height: '42px', borderRadius: '50%',
                  background: 'rgba(0,0,0,0.55)', border: '1.5px solid var(--border-gold)',
                  color: '#fff', fontSize: '20px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  backdropFilter: 'blur(8px)', transition: 'all 0.15s', zIndex: 5,
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(212,160,23,0.4)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--gold-mid)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0.55)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-gold)' }}
              >
                ›
              </button>
            )}
            {/* 사진 카운터 */}
            {photos.length > 1 && (
              <div style={{
                position: 'absolute', bottom: '12px', left: '50%', transform: 'translateX(-50%)',
                background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)',
                padding: '3px 12px', borderRadius: '100px',
                fontSize: '0.72rem', color: 'rgba(255,255,255,0.65)',
                pointerEvents: 'none', zIndex: 5,
              }}>
                {currentIndex + 1} / {photos.length}
              </div>
            )}

            {/* 사진 정보 오버레이 (하단) */}
            <div style={{
              position: 'absolute', bottom: 0, left: 0, right: 0,
              padding: '28px 14px 14px',
              background: 'linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 100%)',
              pointerEvents: 'none',
            }}>
              {photo.description && (
                <p style={{ fontSize: '13px', fontWeight: 600, color: '#fff', margin: 0, marginBottom: '3px', textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}>
                  {photo.description}
                </p>
              )}
              <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)', margin: 0 }}>
                {photo.taken_date} · {photo.uploader}
              </p>
            </div>

            {/* 모바일: 하단 슬라이드업 댓글 패널 */}
            {isMobile && (
              <div
                style={{
                  position: 'absolute', bottom: 0, left: 0, right: 0, height: '65%',
                  background: 'var(--bg-card)',
                  backdropFilter: 'blur(12px)',
                  borderTop: '1px solid var(--border-dark)',
                  transform: showComments ? 'translateY(0%)' : 'translateY(100%)',
                  transition: 'transform 0.28s cubic-bezier(0.4,0,0.2,1)',
                  display: 'flex', flexDirection: 'column', zIndex: 5,
                }}
              >
                {commentPanel}
              </div>
            )}

            {/* ── 플로팅 액션 버튼 (유튜브 쇼츠 스타일) ── */}
            <div style={{
              position: 'absolute', right: '14px', bottom: '72px',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px',
              zIndex: 6,
            }}>
              {/* 좋아요 */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                <button
                  onClick={handleLike}
                  title="좋아요"
                  style={{
                    width: '46px', height: '46px', borderRadius: '50%',
                    background: 'rgba(0,0,0,0.45)',
                    border: `1.5px solid ${liked ? 'rgba(255,130,130,0.9)' : 'rgba(255,130,130,0.35)'}`,
                    boxShadow: liked ? '0 0 14px rgba(255,100,100,0.45)' : 'none',
                    backdropFilter: 'blur(10px)',
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all 0.2s',
                  }}
                >
                  <svg width="19" height="19" viewBox="0 0 24 24"
                    fill={liked ? '#ff7a7a' : 'none'}
                    stroke={liked ? '#ff7a7a' : 'rgba(255,140,140,0.6)'}
                    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
                    style={{ filter: liked ? 'drop-shadow(0 0 4px rgba(255,100,100,0.6))' : 'none', transition: 'all 0.2s' }}
                  >
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                  </svg>
                </button>
                <span style={{ fontSize: '11px', fontWeight: 700, color: liked ? '#ff9a9a' : 'rgba(255,150,150,0.6)', textShadow: '0 1px 5px rgba(0,0,0,0.9)', transition: 'color 0.2s' }}>
                  {likeCount}
                </span>
              </div>
              {/* 댓글 */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                <button
                  onClick={() => setShowComments(!showComments)}
                  title="댓글"
                  style={{
                    width: '46px', height: '46px', borderRadius: '50%',
                    background: 'rgba(0,0,0,0.45)',
                    border: `1.5px solid ${showComments ? 'rgba(240,200,80,0.9)' : 'rgba(240,200,80,0.35)'}`,
                    boxShadow: showComments ? '0 0 14px rgba(240,200,80,0.4)' : 'none',
                    backdropFilter: 'blur(10px)',
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all 0.2s',
                  }}
                >
                  <svg width="19" height="19" viewBox="0 0 24 24"
                    fill={showComments ? '#f0c850' : 'none'}
                    stroke={showComments ? '#f0c850' : 'rgba(240,200,80,0.6)'}
                    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
                    style={{ filter: showComments ? 'drop-shadow(0 0 4px rgba(240,200,80,0.6))' : 'none', transition: 'all 0.2s' }}
                  >
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </button>
                <span style={{ fontSize: '11px', fontWeight: 700, color: showComments ? '#f0c850' : 'rgba(240,200,80,0.6)', textShadow: '0 1px 5px rgba(0,0,0,0.9)', transition: 'color 0.2s' }}>
                  {comments.length}
                </span>
              </div>
            </div>
          </div>

          {/* ── 데스크탑: 오른쪽 댓글 패널 ── */}
          {!isMobile && (
            <div style={{
              width: showComments ? '340px' : '0px',
              flexShrink: 0,
              overflow: 'hidden',
              transition: 'width 0.3s cubic-bezier(0.4,0,0.2,1)',
              background: 'var(--bg-card)',
              borderRadius: '12px',
              marginLeft: showComments ? '10px' : '0px',
              display: 'flex', flexDirection: 'column',
            }}>
              <div style={{ minWidth: '340px', height: '100%', display: 'flex', flexDirection: 'column' }}>
                {commentPanel}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ─── 이달의 모델 피처드 사진 (2열×3행 스팬, 음악 재생 버튼 포함) ───
function ModelFeaturedPhoto({
  photo,
  onOpen,
}: {
  photo: Photo
  onOpen: (p: Photo, showComments: boolean) => void
}) {
  const [isPlaying, setIsPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    const audio = new Audio('/hero-music2.mp3')
    audio.loop = true
    audioRef.current = audio
    return () => { audio.pause(); audio.src = '' }
  }, [])

  function toggleMusic(e: React.MouseEvent) {
    e.stopPropagation()
    const audio = audioRef.current
    if (!audio) return
    if (!isPlaying) {
      audio.play().catch(() => {})
      setIsPlaying(true)
    } else {
      audio.pause()
      setIsPlaying(false)
    }
  }

  return (
    <div
      style={{
        gridColumn: 'span 2',
        gridRow: 'span 3',
        position: 'relative',
        overflow: 'hidden',
        borderRadius: '10px',
        border: '1px solid var(--border-gold)',
        background: 'var(--bg-card)',
        cursor: 'pointer',
      }}
      onClick={() => onOpen(photo, false)}
    >
      {/* 이미지 — 잘림 없이 전체 표시 */}
      <img
        src={getImageUrl(photo.file_key)}
        alt={photo.description ?? '이달의 모델'}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          display: 'block',
        }}
      />

      {/* 하단 그라데이션 */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: '45%',
        background: 'linear-gradient(to top, rgba(0,0,0,0.72) 0%, transparent 100%)',
        pointerEvents: 'none',
      }} />

      {/* 이달의 모델 배지 — 우측 하단 */}
      <div style={{
        position: 'absolute', bottom: 14, right: 14,
        background: 'rgba(255,192,203,0.28)',
        border: '1px solid rgba(255,192,203,0.75)',
        color: '#ffcce0', fontSize: '0.62rem', letterSpacing: '0.22em', fontWeight: 700,
        padding: '5px 14px', borderRadius: '100px',
        backdropFilter: 'blur(8px)',
        boxShadow: '0 2px 12px rgba(255,150,180,0.35)',
        pointerEvents: 'none',
      }}>
        ✦ 이달의 모델
      </div>

      {/* 음악 재생 버튼 */}
      <div
        style={{
          position: 'absolute', bottom: 14, left: 14,
          display: 'flex', alignItems: 'center', gap: '9px',
        }}
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={toggleMusic}
          style={{
            width: 36, height: 36, borderRadius: '50%',
            background: isPlaying ? 'rgba(212,160,23,0.75)' : 'rgba(0,0,0,0.55)',
            border: `1.5px solid ${isPlaying ? 'var(--gold-mid)' : 'rgba(255,255,255,0.35)'}`,
            color: '#fff', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            backdropFilter: 'blur(8px)',
            transition: 'all 0.2s',
            flexShrink: 0,
          }}
        >
          {isPlaying ? (
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
              <rect x="5" y="3" width="5" height="18" rx="1" />
              <rect x="14" y="3" width="5" height="18" rx="1" />
            </svg>
          ) : (
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="6,3 20,12 6,21" />
            </svg>
          )}
        </button>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <span style={{ fontSize: '0.65rem', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.9)', fontWeight: 700 }}>개화(開花)</span>
          <span style={{ fontSize: '0.52rem', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.4)' }}>LEGION THEME</span>
        </div>
      </div>
    </div>
  )
}

// ─── 사진 그리드 아이템 ───
function PhotoGridItem({
  photo,
  onOpen,
}: {
  photo: Photo
  onOpen: (p: Photo, showComments: boolean) => void
}) {
  const [commentCount, setCommentCount] = useState<number | null>(null)
  const [likeCount, setLikeCount] = useState<number | null>(null)

  useEffect(() => {
    commentApi.getAll('gallery', photo.id)
      .then(list => setCommentCount(list.length))
      .catch(() => setCommentCount(0))
  }, [photo.id])

  useEffect(() => {
    likeApi.get(photo.id)
      .then(({ count }) => setLikeCount(count))
      .catch(() => setLikeCount(0))
  }, [photo.id])

  return (
    <div
      className="relative group rounded-lg overflow-hidden"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-dark)', cursor: 'pointer' }}
      onClick={() => onOpen(photo, false)}
    >
      <img
        src={getImageUrl(photo.file_key)}
        alt={photo.description ?? ''}
        className="w-full object-cover"
        style={{ height: '192px', display: 'block' }}
      />
      {photo.description && (
        <p className="text-xs px-2 py-1 truncate" style={{ color: 'var(--text-sub)' }}>
          {photo.description}
        </p>
      )}
      {/* 호버 오버레이 + 좋아요 + 댓글 버튼 */}
      <div
        className="absolute inset-0 flex items-end justify-between p-2 opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.6) 40%, transparent)' }}
      >
        <button
          onClick={e => { e.stopPropagation(); onOpen(photo, false) }}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-semibold"
          style={{ background: 'rgba(0,0,0,0.65)', color: '#fff', border: '1px solid rgba(255,255,255,0.25)', cursor: 'pointer', fontFamily: 'inherit' }}
        >
          ❤️ {likeCount !== null ? likeCount : '…'}
        </button>
        <button
          onClick={e => { e.stopPropagation(); onOpen(photo, true) }}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-semibold"
          style={{ background: 'rgba(0,0,0,0.65)', color: '#fff', border: '1px solid rgba(255,255,255,0.25)', cursor: 'pointer', fontFamily: 'inherit' }}
        >
          💬 {commentCount !== null ? commentCount : '…'}
        </button>
      </div>
    </div>
  )
}

function GalleryContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const month = searchParams.get('month')

  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [months, setMonths] = useState<GalleryMonth[]>([])
  const [photos, setPhotos] = useState<Photo[]>([])
  const [loadingMonths, setLoadingMonths] = useState(true)
  const [loadingPhotos, setLoadingPhotos] = useState(false)
  const [viewerState, setViewerState] = useState<{ index: number; showComments: boolean } | null>(null)
  const [sortedPhotos, setSortedPhotos] = useState<Photo[]>([])

  useEffect(() => {
    setIsSuperAdmin(getAdminRole() === 'super')
  }, [])

  useEffect(() => {
    galleryApi.getMonths()
      .then(setMonths)
      .catch(console.error)
      .finally(() => setLoadingMonths(false))
  }, [])

  useEffect(() => {
    if (!month) return
    setLoadingPhotos(true)
    galleryApi.getByMonth(month)
      .then(setPhotos)
      .catch(console.error)
      .finally(() => setLoadingPhotos(false))
  }, [month])

  // sortedPhotos 유지
  useEffect(() => {
    const sorted = [...photos].sort((a, b) => {
      if (a.is_featured === 1 && b.is_featured !== 1) return -1
      if (a.is_featured !== 1 && b.is_featured === 1) return 1
      return 0
    })
    setSortedPhotos(sorted)
  }, [photos])

  function handleOpen(photo: Photo, showComments: boolean) {
    const index = sortedPhotos.findIndex(p => p.id === photo.id)
    setViewerState({ index: Math.max(0, index), showComments })
  }

  if (month) {
    return (
      <>
        <div className="space-y-6">
          {isSuperAdmin ? (
            /* ── 최고관리자 월별 헤더 ── */
            <div className="flex items-center gap-4 pb-4" style={{ borderBottom: '1px solid var(--border-gold)' }}>
              <button
                onClick={() => router.push('/gallery')}
                className="text-sm transition-colors"
                style={{
                  color: 'var(--gold-mid)', background: 'none',
                  border: '1px solid var(--border-gold)',
                  borderRadius: '100px', cursor: 'pointer',
                  padding: '6px 16px', fontFamily: 'inherit',
                }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--gold-mid)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-gold)')}
              >
                ← 목록으로
              </button>
              <h1 className="text-2xl font-bold" style={{ color: 'var(--text-main)' }}>
                {formatYearMonth(month)} 사진
              </h1>
            </div>
          ) : (
            /* ── 기존 월별 헤더 ── */
            <div className="flex items-center gap-4 pb-4" style={{ borderBottom: '1px solid var(--border-dark)' }}>
              <button
                onClick={() => router.push('/gallery')}
                className="text-sm transition-colors"
                style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--gold-mid)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
              >
                ← 목록으로
              </button>
              <h1 className="text-2xl font-bold" style={{ color: 'var(--text-main)' }}>
                {formatYearMonth(month)} 사진
              </h1>
            </div>
          )}
          {loadingPhotos ? (
            <p className="text-center py-8" style={{ color: 'var(--text-muted)' }}>불러오는 중...</p>
          ) : photos.length === 0 ? (
            <p className="text-center py-8" style={{ color: 'var(--text-muted)' }}>사진이 없습니다.</p>
          ) : (
            /* 이달의 모델 사진 감지: description에 '이달의 모델' 포함 시 2×3 스팬, 항상 첫 번째 배치 */
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gridAutoRows: '192px',
              gap: '16px',
            }}>
              {sortedPhotos.map(photo => {
                const isModel = photo.is_featured === 1
                if (isModel) {
                  return (
                    <ModelFeaturedPhoto
                      key={photo.id}
                      photo={photo}
                      onOpen={handleOpen}
                    />
                  )
                }
                return (
                  <PhotoGridItem
                    key={photo.id}
                    photo={photo}
                    onOpen={handleOpen}
                  />
                )
              })}
            </div>
          )}
        </div>

        {viewerState && (
          <PhotoViewerModal
            photos={sortedPhotos}
            initialIndex={viewerState.index}
            initialShowComments={viewerState.showComments}
            onClose={() => setViewerState(null)}
          />
        )}
      </>
    )
  }

  // 연도별 그룹핑
  const grouped = months.reduce((acc, m) => {
    const year = m.year_month.split('-')[0]
    if (!acc[year]) acc[year] = []
    acc[year].push(m)
    return acc
  }, {} as Record<string, GalleryMonth[]>)
  const years = Object.keys(grouped).sort((a, b) => parseInt(b) - parseInt(a))

  // ── 최고관리자 월별 목록 뷰 ──
  if (isSuperAdmin) {
    return (
      <div>
        <SuperSectionHeader label="갤러리" />
        {loadingMonths ? (
          <p className="text-center py-8" style={{ color: 'var(--text-muted)' }}>불러오는 중...</p>
        ) : months.length === 0 ? (
          <p className="text-center py-8" style={{ color: 'var(--text-muted)' }}>등록된 사진이 없습니다.</p>
        ) : (
          <div className="space-y-8">
            {years.map(year => (
              <div key={year} className="space-y-4">
                <h2
                  className="text-xl font-bold"
                  style={{
                    color: 'var(--gold-mid)',
                    borderBottom: '1px solid var(--border-gold)',
                    paddingBottom: '10px',
                    letterSpacing: '0.08em',
                  }}
                >
                  {year}년
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {grouped[year].map(({ year_month, count, thumbnail_key, has_featured }) => (
                    <a
                      key={year_month}
                      href={`/gallery?month=${year_month}`}
                      style={{
                        background: 'var(--bg-card)',
                        border: `1px solid ${has_featured ? 'rgba(255,192,203,0.5)' : 'var(--border-gold)'}`,
                        borderRadius: '10px',
                        padding: 0,
                        textDecoration: 'none',
                        display: 'block',
                        transition: 'all 0.15s',
                        overflow: 'hidden',
                      }}
                      onMouseEnter={e => {
                        const el = e.currentTarget as HTMLAnchorElement
                        el.style.background = 'rgba(212,160,23,0.07)'
                        el.style.borderColor = has_featured ? 'rgba(255,192,203,0.8)' : 'var(--gold-mid)'
                      }}
                      onMouseLeave={e => {
                        const el = e.currentTarget as HTMLAnchorElement
                        el.style.background = 'var(--bg-card)'
                        el.style.borderColor = has_featured ? 'rgba(255,192,203,0.5)' : 'var(--border-gold)'
                      }}
                    >
                      {/* ── 이미지 영역 ── */}
                      <div style={{ width: '100%', aspectRatio: '3/4', overflow: 'hidden', position: 'relative', flexShrink: 0 }}>
                        {thumbnail_key ? (
                          <img
                            src={getImageUrl(thumbnail_key)}
                            alt={formatYearMonth(year_month)}
                            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', transition: 'transform 0.35s' }}
                            onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.06)')}
                            onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
                          />
                        ) : (
                          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-base)' }}>
                            <img src="/images/came.svg" alt="" style={{ width: '40px', height: '40px', opacity: 0.3 }} />
                          </div>
                        )}
                        {/* 이달의 모델 배지 */}
                        {has_featured === 1 && (
                          <div style={{
                            position: 'absolute', top: '10px', right: '10px',
                            background: 'rgba(255,192,203,0.25)',
                            border: '1px solid rgba(255,192,203,0.75)',
                            color: '#ffcce0', fontSize: '0.58rem',
                            letterSpacing: '0.18em', fontWeight: 700,
                            padding: '4px 10px', borderRadius: '100px',
                            backdropFilter: 'blur(8px)',
                            boxShadow: '0 2px 10px rgba(255,150,180,0.3)',
                            pointerEvents: 'none',
                          }}>
                            ✦ 이달의 모델
                          </div>
                        )}
                      </div>
                      {/* ── 정보 바 (이미지 아래, 항상 명확하게) ── */}
                      <div style={{
                        padding: '10px 14px 12px',
                        borderTop: `1px solid ${has_featured ? 'rgba(255,192,203,0.3)' : 'var(--border-gold)'}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      }}>
                        <div>
                          <p style={{
                            fontSize: '0.7rem', letterSpacing: '0.1em',
                            color: 'var(--text-muted)', margin: 0, lineHeight: 1.2,
                          }}>
                            {year_month.split('-')[0]}년
                          </p>
                          <p style={{
                            fontSize: '1.05rem', fontWeight: 800, letterSpacing: '0.05em',
                            color: 'var(--text-main)', margin: 0, lineHeight: 1.2,
                          }}>
                            {parseInt(year_month.split('-')[1])}월
                          </p>
                        </div>
                        <span style={{
                          fontSize: '0.72rem', fontWeight: 600,
                          color: 'var(--text-muted)',
                          background: 'var(--bg-base)',
                          border: '1px solid var(--border-gold)',
                          padding: '3px 9px', borderRadius: '100px',
                        }}>
                          {count}장
                        </span>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ── 기존 월별 목록 뷰 ──
  return (
    <div className="space-y-8">
      <SectionTitle label="사진첩" />
      {loadingMonths ? (
        <p className="text-center py-8" style={{ color: 'var(--text-muted)' }}>불러오는 중...</p>
      ) : months.length === 0 ? (
        <p className="text-center py-8" style={{ color: 'var(--text-muted)' }}>등록된 사진이 없습니다.</p>
      ) : (
        years.map(year => (
          <div key={year} className="space-y-4">
            <h2
              className="text-xl font-bold"
              style={{ color: 'var(--gold-mid)', borderBottom: '1px solid var(--border-gold)', paddingBottom: '8px' }}
            >
              {year}년
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {grouped[year].map(({ year_month, count }) => (
                <a
                  key={year_month}
                  href={`/gallery?month=${year_month}`}
                  className="rounded-lg p-6 text-center transition-colors"
                  style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-gold)',
                    textDecoration: 'none',
                    display: 'block',
                  }}
                  onMouseEnter={e => {
                    const el = e.currentTarget as HTMLAnchorElement
                    el.style.background = 'rgba(212,160,23,0.07)'
                    el.style.borderColor = 'var(--gold-mid)'
                  }}
                  onMouseLeave={e => {
                    const el = e.currentTarget as HTMLAnchorElement
                    el.style.background = 'var(--bg-card)'
                    el.style.borderColor = 'var(--border-gold)'
                  }}
                >
                  <img src="/images/came.svg" alt="" style={{ width: '36px', height: '36px', margin: '0 auto' }} />
                  <p className="font-medium mt-2" style={{ color: 'var(--text-main)' }}>
                    {formatYearMonth(year_month)}
                  </p>
                  <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>{count}장</p>
                </a>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  )
}

export default function GalleryPage() {
  return (
    <Suspense fallback={<p className="text-center py-8" style={{ color: 'var(--text-muted)' }}>불러오는 중...</p>}>
      <GalleryContent />
    </Suspense>
  )
}
