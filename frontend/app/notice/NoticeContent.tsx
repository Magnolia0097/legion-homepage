'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { noticeApi, getImageUrl } from '@/lib/api'
import NoticeCard from '@/components/NoticeCard'
import type { Notice } from '@/types'
import { renderHtml } from '@/components/RichTextEditor'
import AudioPlayer from '@/components/AudioPlayer'
import CommentSection from '@/components/CommentSection'
import { getAdminRole } from '@/lib/firebase'

// useSearchParams() 대신 window.location.search를 직접 읽어
// SSR 중 BAILOUT_TO_CLIENT_SIDE_RENDERING 마커가 생성되지 않도록 함
function useClientId(): string | null {
  const [id, setId] = useState<string | null>(null)

  useEffect(() => {
    const getParam = () => new URLSearchParams(window.location.search).get('id')
    setId(getParam())

    // 브라우저 뒤로가기/앞으로가기 감지
    const onPop = () => setId(getParam())
    window.addEventListener('popstate', onPop)

    // Next.js 클라이언트 사이드 네비게이션(pushState) 감지
    const orig = history.pushState
    const patched = function (this: History, ...args: Parameters<typeof history.pushState>) {
      orig.apply(this, args)
      setId(getParam())
    }
    history.pushState = patched

    return () => {
      window.removeEventListener('popstate', onPop)
      if (history.pushState === patched) {
        history.pushState = orig
      }
    }
  }, [])

  return id
}

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

export default function NoticeContent() {
  const router = useRouter()
  const id = useClientId()
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)

  const [notices, setNotices] = useState<Notice[]>([])
  const [notice, setNotice] = useState<Notice | null>(null)
  const [loadingList, setLoadingList] = useState(true)
  const [loadingDetail, setLoadingDetail] = useState(false)

  // 읽음 처리 (super admin 전용)
  const [readIds, setReadIds] = useState<Set<number>>(new Set())

  useEffect(() => {
    setIsSuperAdmin(getAdminRole() === 'super')
  }, [])

  // localStorage에서 readIds 로드
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('notice_read_ids') || '[]')
      setReadIds(new Set(stored))
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    noticeApi.getAll()
      .then(setNotices)
      .catch(console.error)
      .finally(() => setLoadingList(false))
  }, [])

  useEffect(() => {
    if (!id) {
      setNotice(null)
      return
    }
    // id 변경 시 이전 공지 초기화 후 새로 로드
    setNotice(null)
    setLoadingDetail(true)
    noticeApi.getOne(Number(id))
      .then(setNotice)
      .catch(console.error)
      .finally(() => setLoadingDetail(false))
  }, [id])

  // 상세 진입 시 readIds에 id 추가
  useEffect(() => {
    if (!id) return
    const numId = Number(id)
    setReadIds(prev => {
      const next = new Set(prev)
      next.add(numId)
      try {
        localStorage.setItem('notice_read_ids', JSON.stringify([...next]))
      } catch { /* ignore */ }
      return next
    })
  }, [id])

  if (id) {
    // notice가 없으면 로딩 중 표시 (이전 공지가 초기화됐거나 아직 로드 중)
    if (loadingDetail || !notice) return <p className="py-8 text-center" style={{ color: 'var(--text-muted)' }}>불러오는 중...</p>

    const date = new Date(notice.created_at).toLocaleDateString('ko-KR')

    // ── 최고관리자 상세 뷰 ──
    if (isSuperAdmin) {
      return (
        <div className="max-w-2xl space-y-6">
          <style>{`
            @keyframes badge-pulse { 0%,100%{opacity:1} 50%{opacity:0.6} }
          `}</style>
          <button
            onClick={() => router.push('/notice')}
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

          <div className="pb-4" style={{ borderBottom: '1px solid var(--border-gold)' }}>
            <div className="flex items-center gap-2 mb-2">
              {notice.is_pinned === 1 && (
                <span
                  className="text-xs font-bold px-2 py-0.5 rounded shrink-0"
                  style={{ background: 'var(--gold-mid)', color: 'var(--bg-base)' }}
                >
                  고정
                </span>
              )}
              <h1 className="text-2xl font-bold" style={{ color: 'var(--text-main)' }}>
                {notice.title}
              </h1>
            </div>
            <div className="text-sm flex gap-4" style={{ color: 'var(--text-muted)' }}>
              <span>{notice.author}</span>
              <span>{date}</span>
              <span>👁 {notice.view_count ?? 0}회</span>
            </div>
          </div>

          {notice.music_key && (
            <AudioPlayer key={notice.music_key} src={getImageUrl(notice.music_key)} autoPlay />
          )}

          <div
            className="leading-relaxed"
            style={{ color: 'var(--text-sub)' }}
            dangerouslySetInnerHTML={{ __html: renderHtml(notice.content) }}
          />

          <CommentSection targetType="notice" targetId={notice.id} />

          {/* 이전/다음 글 네비 */}
          {(() => {
            const idx = notices.findIndex(n => n.id === notice.id)
            const prev = notices[idx + 1] // 최신순이라 +1이 이전 글
            const next = notices[idx - 1] // -1이 다음 글
            if (!prev && !next) return null
            return (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '16px' }}>
                {prev ? (
                  <div
                    onClick={() => router.push(`/notice?id=${prev.id}`)}
                    style={{ padding: '14px 16px', borderRadius: '10px', border: '1px solid var(--border-gold)', background: 'var(--bg-card)', cursor: 'pointer', transition: 'all 0.15s' }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--gold-mid)'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-gold)'}
                  >
                    <div style={{ fontSize: '0.65rem', letterSpacing: '0.2em', color: 'var(--text-muted)', marginBottom: '4px' }}>← 이전 글</div>
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-sub)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{prev.title}</div>
                  </div>
                ) : <div />}
                {next ? (
                  <div
                    onClick={() => router.push(`/notice?id=${next.id}`)}
                    style={{ padding: '14px 16px', borderRadius: '10px', border: '1px solid var(--border-gold)', background: 'var(--bg-card)', cursor: 'pointer', transition: 'all 0.15s', textAlign: 'right' }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--gold-mid)'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-gold)'}
                  >
                    <div style={{ fontSize: '0.65rem', letterSpacing: '0.2em', color: 'var(--text-muted)', marginBottom: '4px' }}>다음 글 →</div>
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-sub)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{next.title}</div>
                  </div>
                ) : <div />}
              </div>
            )
          })()}
        </div>
      )
    }

    // ── 기존 상세 뷰 ──
    return (
      <div className="max-w-2xl space-y-6">
        <button
          onClick={() => router.push('/notice')}
          className="text-sm transition-colors"
          style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--gold-mid)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
        >
          ← 목록으로
        </button>

        <div className="pb-4" style={{ borderBottom: '1px solid var(--border-dark)' }}>
          <div className="flex items-center gap-2 mb-2">
            {notice.is_pinned === 1 && (
              <span
                className="text-xs font-bold px-2 py-0.5 rounded shrink-0"
                style={{ background: 'var(--gold-mid)', color: 'var(--bg-base)' }}
              >
                고정
              </span>
            )}
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text-main)' }}>
              {notice.title}
            </h1>
          </div>
          <div className="text-sm flex gap-4" style={{ color: 'var(--text-muted)' }}>
            <span>{notice.author}</span>
            <span>{date}</span>
          </div>
        </div>

        {notice.music_key && (
          <AudioPlayer key={notice.music_key} src={getImageUrl(notice.music_key)} autoPlay />
        )}

        <div
          className="leading-relaxed"
          style={{ color: 'var(--text-sub)' }}
          dangerouslySetInnerHTML={{ __html: renderHtml(notice.content) }}
        />

        <CommentSection targetType="notice" targetId={notice.id} />
      </div>
    )
  }

  // ── 최고관리자 목록 뷰 ──
  if (isSuperAdmin) {
    return (
      <div>
        <style>{`
          @keyframes badge-pulse { 0%,100%{opacity:1} 50%{opacity:0.6} }
        `}</style>
        <SuperSectionHeader label="공지사항" />
        {loadingList ? (
          <p className="text-center py-8" style={{ color: 'var(--text-muted)' }}>불러오는 중...</p>
        ) : notices.length === 0 ? (
          <p className="text-center py-8" style={{ color: 'var(--text-muted)' }}>등록된 공지가 없습니다.</p>
        ) : (
          <div className="space-y-3">
            {notices.map((n) => {
              const isNew = !readIds.has(n.id)
              return (
                <div
                  key={n.id}
                  onClick={() => router.push(`/notice?id=${n.id}`)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '14px 16px', borderRadius: '10px',
                    background: 'var(--bg-card)', border: '1px solid var(--border-gold)',
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.borderColor = 'var(--gold-mid)'
                    ;(e.currentTarget as HTMLElement).style.background = 'rgba(212,160,23,0.05)'
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-gold)'
                    ;(e.currentTarget as HTMLElement).style.background = 'var(--bg-card)'
                  }}
                >
                  {n.is_pinned === 1 && (
                    <span style={{ fontSize: '0.62rem', fontWeight: 800, padding: '2px 8px', borderRadius: '4px', background: 'var(--gold-mid)', color: 'var(--bg-base)', whiteSpace: 'nowrap', flexShrink: 0 }}>고정</span>
                  )}
                  {isNew && (
                    <span style={{
                      fontSize: '0.6rem', fontWeight: 800, padding: '2px 7px', borderRadius: '4px',
                      background: 'rgba(220,50,50,0.9)', color: '#fff', whiteSpace: 'nowrap', flexShrink: 0,
                      animation: 'badge-pulse 1.5s infinite',
                    }}>NEW</span>
                  )}
                  <span style={{ flex: 1, fontSize: '0.88rem', fontWeight: isNew ? 600 : 400, color: isNew ? 'var(--text-main)' : 'var(--text-muted)', minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {n.title}
                  </span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '3px' }}>
                    👁 {n.view_count ?? 0}
                  </span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {new Date(n.created_at).toLocaleDateString('ko-KR')}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // ── 기존 목록 뷰 ──
  return (
    <div className="space-y-4">
      <SectionTitle label="공지사항" />
      {loadingList ? (
        <p className="text-center py-8" style={{ color: 'var(--text-muted)' }}>불러오는 중...</p>
      ) : notices.length === 0 ? (
        <p className="text-center py-8" style={{ color: 'var(--text-muted)' }}>등록된 공지가 없습니다.</p>
      ) : (
        <div className="space-y-3">
          {notices.map((n) => (
            <NoticeCard key={n.id} notice={n} />
          ))}
        </div>
      )}
    </div>
  )
}
