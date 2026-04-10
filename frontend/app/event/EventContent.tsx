'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { eventApi, getImageUrl } from '@/lib/api'
import { renderHtml } from '@/components/RichTextEditor'
import AudioPlayer from '@/components/AudioPlayer'
import CommentSection from '@/components/CommentSection'
import type { Event, EventDetail } from '@/types'
import { getAdminRole } from '@/lib/firebase'

type Tab = 'active' | 'ended'

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

// D-day 계산 함수
function getDday(endDate: string | null | undefined): string | null {
  if (!endDate) return null
  const diff = new Date(endDate).setHours(0,0,0,0) - new Date().setHours(0,0,0,0)
  const days = Math.round(diff / 86400000)
  if (days < 0) return null // 이미 종료
  if (days === 0) return 'D-DAY'
  return `D-${days}`
}

export default function EventContent() {
  const router = useRouter()
  const id = useClientId()
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)

  const [events, setEvents] = useState<Event[]>([])
  const [detail, setDetail] = useState<EventDetail | null>(null)
  const [tab, setTab] = useState<Tab>('active')
  const [loading, setLoading] = useState(true)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [lightbox, setLightbox] = useState<string | null>(null)

  useEffect(() => {
    setIsSuperAdmin(getAdminRole() === 'super')
  }, [])

  useEffect(() => {
    eventApi.getAll()
      .then(setEvents)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!id) { setDetail(null); return }
    setLoadingDetail(true)
    eventApi.getOne(Number(id))
      .then(setDetail)
      .catch(console.error)
      .finally(() => setLoadingDetail(false))
  }, [id])

  // ─── 상세 뷰 ───
  if (id) {
    if (loadingDetail) return (
      <p className="py-8 text-center" style={{ color: 'var(--text-muted)' }}>불러오는 중...</p>
    )
    if (!detail) return (
      <p className="py-8 text-center" style={{ color: 'var(--text-muted)' }}>존재하지 않는 이벤트입니다.</p>
    )

    const date = new Date(detail.created_at).toLocaleDateString('ko-KR')

    // ── 최고관리자 상세 뷰 ──
    if (isSuperAdmin) {
      return (
        <div className="max-w-2xl space-y-6">
          <button
            onClick={() => router.push('/event')}
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
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span
                className="text-xs font-bold px-2 py-0.5 rounded shrink-0"
                style={{
                  background: detail.status === 'active' ? 'var(--gold-mid)' : 'var(--text-muted)',
                  color: 'var(--bg-base)',
                }}
              >
                {detail.status === 'active' ? '진행중' : '종료'}
              </span>
              <h1 className="text-2xl font-bold" style={{ color: 'var(--text-main)' }}>
                {detail.title}
              </h1>
            </div>
            <div className="text-sm flex gap-4" style={{ color: 'var(--text-muted)' }}>
              <span>{detail.author}</span>
              <span>{date}</span>
              <span>👁 {detail.view_count ?? 0}회</span>
            </div>
          </div>

          {detail.music_key && (
            <AudioPlayer key={detail.music_key} src={getImageUrl(detail.music_key)} autoPlay />
          )}

          <div
            className="leading-relaxed"
            style={{ color: 'var(--text-sub)' }}
            dangerouslySetInnerHTML={{ __html: renderHtml(detail.content) }}
          />

          {detail.photos.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {detail.photos.map((photo) => (
                <div
                  key={photo.id}
                  className="rounded-lg overflow-hidden cursor-pointer"
                  style={{
                    aspectRatio: '1',
                    border: '1px solid var(--border-gold)',
                    background: 'var(--bg-base)',
                  }}
                  onClick={() => setLightbox(getImageUrl(photo.file_key))}
                >
                  <img
                    src={getImageUrl(photo.file_key)}
                    alt=""
                    className="w-full h-full object-cover transition-transform duration-200"
                    style={{ display: 'block' }}
                    onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.04)')}
                    onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
                  />
                </div>
              ))}
            </div>
          )}

          {lightbox && (
            <div
              className="fixed inset-0 flex items-center justify-center z-50"
              style={{ background: 'rgba(0,0,0,0.88)' }}
              onClick={() => setLightbox(null)}
            >
              <img
                src={lightbox}
                alt=""
                style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: '8px', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}
                onClick={e => e.stopPropagation()}
              />
              <button
                onClick={() => setLightbox(null)}
                style={{
                  position: 'fixed', top: '20px', right: '24px',
                  background: 'none', border: 'none', color: '#fff',
                  fontSize: '28px', cursor: 'pointer', lineHeight: 1,
                }}
              >
                ✕
              </button>
            </div>
          )}

          <CommentSection targetType="event" targetId={detail.id} />
        </div>
      )
    }

    // ── 기존 상세 뷰 ──
    return (
      <div className="max-w-2xl space-y-6">
        <button
          onClick={() => router.push('/event')}
          className="text-sm transition-colors"
          style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--gold-mid)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
        >
          ← 목록으로
        </button>

        <div className="pb-4" style={{ borderBottom: '1px solid var(--border-dark)' }}>
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span
              className="text-xs font-bold px-2 py-0.5 rounded shrink-0"
              style={{
                background: detail.status === 'active' ? 'var(--gold-mid)' : 'var(--text-muted)',
                color: 'var(--bg-base)',
              }}
            >
              {detail.status === 'active' ? '진행중' : '종료'}
            </span>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text-main)' }}>
              {detail.title}
            </h1>
          </div>
          <div className="text-sm flex gap-4" style={{ color: 'var(--text-muted)' }}>
            <span>{detail.author}</span>
            <span>{date}</span>
          </div>
        </div>

        {detail.music_key && (
          <AudioPlayer key={detail.music_key} src={getImageUrl(detail.music_key)} autoPlay />
        )}

        <div
          className="leading-relaxed"
          style={{ color: 'var(--text-sub)' }}
          dangerouslySetInnerHTML={{ __html: renderHtml(detail.content) }}
        />

        {detail.photos.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {detail.photos.map((photo) => (
              <div
                key={photo.id}
                className="rounded-lg overflow-hidden cursor-pointer"
                style={{
                  aspectRatio: '1',
                  border: '1px solid var(--border-dark)',
                  background: 'var(--bg-base)',
                }}
                onClick={() => setLightbox(getImageUrl(photo.file_key))}
              >
                <img
                  src={getImageUrl(photo.file_key)}
                  alt=""
                  className="w-full h-full object-cover transition-transform duration-200"
                  style={{ display: 'block' }}
                  onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.04)')}
                  onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
                />
              </div>
            ))}
          </div>
        )}

        {lightbox && (
          <div
            className="fixed inset-0 flex items-center justify-center z-50"
            style={{ background: 'rgba(0,0,0,0.88)' }}
            onClick={() => setLightbox(null)}
          >
            <img
              src={lightbox}
              alt=""
              style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: '8px', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}
              onClick={e => e.stopPropagation()}
            />
            <button
              onClick={() => setLightbox(null)}
              style={{
                position: 'fixed', top: '20px', right: '24px',
                background: 'none', border: 'none', color: '#fff',
                fontSize: '28px', cursor: 'pointer', lineHeight: 1,
              }}
            >
              ✕
            </button>
          </div>
        )}

        <CommentSection targetType="event" targetId={detail.id} />
      </div>
    )
  }

  // ─── 목록 뷰 ───
  const filtered = events.filter(e => e.status === tab)

  // ── 최고관리자 목록 뷰 ──
  if (isSuperAdmin) {
    return (
      <div>
        <SuperSectionHeader label="이벤트" />

        {/* 탭 — pill 스타일 */}
        <div className="flex gap-2 mb-6">
          {(['active', 'ended'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="text-sm font-semibold transition-colors"
              style={
                tab === t
                  ? {
                    background: 'var(--gold-mid)', color: 'var(--bg-base)',
                    border: '1px solid var(--gold-mid)', cursor: 'pointer',
                    fontFamily: 'inherit', padding: '8px 22px', borderRadius: '100px',
                  }
                  : {
                    background: 'transparent', color: 'var(--text-sub)',
                    border: '1px solid var(--border-gold)', cursor: 'pointer',
                    fontFamily: 'inherit', padding: '8px 22px', borderRadius: '100px',
                  }
              }
            >
              {t === 'active' ? '진행중' : '종료된 이벤트'}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-center py-8" style={{ color: 'var(--text-muted)' }}>불러오는 중...</p>
        ) : filtered.length === 0 ? (
          <p className="text-center py-12" style={{ color: 'var(--text-muted)' }}>
            {tab === 'active' ? '진행중인 이벤트가 없습니다.' : '종료된 이벤트가 없습니다.'}
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {filtered.map((event) => {
              const dday = getDday(event.end_date)
              const isEnded = event.status === 'ended'
              return (
                <button
                  key={event.id}
                  onClick={() => router.push(`/event?id=${event.id}`)}
                  className="rounded-lg overflow-hidden text-left transition-all duration-200"
                  style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-gold)',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    padding: 0,
                    filter: isEnded ? 'grayscale(70%) brightness(0.7)' : 'none',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.borderColor = 'var(--gold-mid)'
                    ;(e.currentTarget as HTMLElement).style.background = 'rgba(212,160,23,0.05)'
                    ;(e.currentTarget as HTMLElement).style.filter = isEnded ? 'grayscale(50%) brightness(0.8)' : 'none'
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-gold)'
                    ;(e.currentTarget as HTMLElement).style.background = 'var(--bg-card)'
                    ;(e.currentTarget as HTMLElement).style.filter = isEnded ? 'grayscale(70%) brightness(0.7)' : 'none'
                  }}
                >
                  <div style={{ width: '100%', aspectRatio: '16/9', overflow: 'hidden', background: 'var(--bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                    {event.thumbnail_key ? (
                      <img src={getImageUrl(event.thumbnail_key)} alt={event.title} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    ) : (
                      <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>사진 없음</span>
                    )}
                    {/* D-day 배지 */}
                    {!isEnded && dday && (
                      <div style={{
                        position: 'absolute', top: '10px', right: '10px',
                        background: dday === 'D-DAY' ? 'rgba(180,0,0,0.6)' : 'rgba(0,0,0,0.7)',
                        border: dday === 'D-DAY' ? '1px solid rgba(255,80,80,0.9)' : '1px solid rgba(255,100,100,0.7)',
                        color: dday === 'D-DAY' ? '#ffaaaa' : '#ff7070',
                        fontSize: '0.68rem', fontWeight: 800, padding: '4px 10px', borderRadius: '100px',
                        backdropFilter: 'blur(6px)', letterSpacing: '0.08em',
                      }}>
                        {dday}
                      </div>
                    )}
                    {/* 종료됨 배지 */}
                    {isEnded && (
                      <div style={{
                        position: 'absolute', top: '10px', right: '10px',
                        background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(130,130,130,0.4)',
                        color: 'rgba(180,180,180,0.6)',
                        fontSize: '0.68rem', fontWeight: 700, padding: '4px 10px', borderRadius: '100px',
                        backdropFilter: 'blur(6px)',
                      }}>
                        종료됨
                      </div>
                    )}
                    {/* 사진 수 배지 */}
                    {(event.photo_count ?? 0) > 0 && (
                      <div style={{
                        position: 'absolute', bottom: '10px', left: '10px',
                        background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.2)',
                        color: 'rgba(255,255,255,0.8)',
                        fontSize: '0.65rem', fontWeight: 600, padding: '3px 9px', borderRadius: '100px',
                        backdropFilter: 'blur(6px)',
                      }}>
                        📷 {event.photo_count}장
                      </div>
                    )}
                  </div>
                  <div className="px-4 py-3 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: event.status === 'active' ? 'var(--gold-mid)' : 'var(--border-dark)', color: event.status === 'active' ? 'var(--bg-base)' : 'var(--text-muted)' }}>
                        {event.status === 'active' ? '진행중' : '종료'}
                      </span>
                      {event.music_key && <span style={{ fontSize: '11px', color: 'var(--gold-mid)' }}>♪</span>}
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '2px' }}>👁 {event.view_count ?? 0}</span>
                    </div>
                    <h3 className="text-sm font-semibold truncate" style={{ color: 'var(--text-main)' }}>{event.title}</h3>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {new Date(event.created_at).toLocaleDateString('ko-KR')}
                      {event.end_date && ` ~ ${new Date(event.end_date).toLocaleDateString('ko-KR')}`}
                    </p>
                  </div>
                </button>
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
      <SectionTitle label="이벤트" />

      {/* 탭 */}
      <div className="flex gap-2 mb-2">
        {(['active', 'ended'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="px-5 py-2 rounded text-sm font-semibold transition-colors"
            style={
              tab === t
                ? { background: 'var(--gold-mid)', color: 'var(--bg-base)', border: '1px solid var(--gold-mid)', cursor: 'pointer', fontFamily: 'inherit' }
                : { background: 'transparent', color: 'var(--text-sub)', border: '1px solid var(--border-gold)', cursor: 'pointer', fontFamily: 'inherit' }
            }
          >
            {t === 'active' ? '진행중' : '종료된 이벤트'}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-center py-8" style={{ color: 'var(--text-muted)' }}>불러오는 중...</p>
      ) : filtered.length === 0 ? (
        <p className="text-center py-12" style={{ color: 'var(--text-muted)' }}>
          {tab === 'active' ? '진행중인 이벤트가 없습니다.' : '종료된 이벤트가 없습니다.'}
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {filtered.map((event) => (
            <button
              key={event.id}
              onClick={() => router.push(`/event?id=${event.id}`)}
              className="rounded-lg overflow-hidden text-left transition-all duration-200"
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border-gold)',
                cursor: 'pointer',
                fontFamily: 'inherit',
                padding: 0,
              }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--gold-mid)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-gold)')}
            >
              <div
                style={{
                  width: '100%', aspectRatio: '16/9', overflow: 'hidden',
                  background: 'var(--bg-base)', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                {event.thumbnail_key ? (
                  <img
                    src={getImageUrl(event.thumbnail_key)}
                    alt={event.title}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                ) : (
                  <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>사진 없음</span>
                )}
              </div>
              <div className="px-4 py-3 space-y-1">
                <div className="flex items-center gap-2">
                  <span
                    className="text-xs font-bold px-1.5 py-0.5 rounded"
                    style={{
                      background: event.status === 'active' ? 'var(--gold-mid)' : 'var(--border-dark)',
                      color: event.status === 'active' ? 'var(--bg-base)' : 'var(--text-muted)',
                    }}
                  >
                    {event.status === 'active' ? '진행중' : '종료'}
                  </span>
                  {event.music_key && (
                    <span style={{ fontSize: '11px', color: 'var(--gold-mid)' }}>♪</span>
                  )}
                </div>
                <h3 className="text-sm font-semibold truncate" style={{ color: 'var(--text-main)' }}>
                  {event.title}
                </h3>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {new Date(event.created_at).toLocaleDateString('ko-KR')}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
