'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { galleryApi, getImageUrl } from '@/lib/api'
import { getAdminRole } from '@/lib/firebase'
import type { Photo } from '@/types'

function formatYearMonth(ym: string) {
  const [year, month] = ym.split('-')
  return year + '년 ' + parseInt(month) + '월'
}

function getMonthLabel(ym: string) {
  return parseInt(ym.split('-')[1]) + '월'
}

function addMonths(ym: string, n: number) {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
}

type TimelineItem =
  | { type: 'model'; data: Photo; month: string }
  | { type: 'future'; month: string }

function ModelCard({ photo, isFirst, align }: { photo: Photo; isFirst: boolean; align: 'left' | 'right' }) {
  return (
    <a href={'/gallery?month=' + photo.taken_date.slice(0, 7)} style={{ textDecoration: 'none', display: 'block' }}>
      <div
        style={{
          background: 'var(--bg-card)',
          border: '1px solid ' + (isFirst ? 'var(--gold-mid)' : 'var(--border-gold)'),
          borderRadius: '14px',
          overflow: 'hidden',
          boxShadow: isFirst ? '0 0 28px rgba(212,160,23,0.15)' : 'none',
          transition: 'all 0.22s',
        }}
        onMouseEnter={e => {
          const el = e.currentTarget as HTMLDivElement
          el.style.borderColor = 'var(--gold-mid)'
          el.style.transform = 'translateY(-3px)'
          el.style.boxShadow = '0 8px 32px rgba(212,160,23,0.18)'
        }}
        onMouseLeave={e => {
          const el = e.currentTarget as HTMLDivElement
          el.style.borderColor = isFirst ? 'var(--gold-mid)' : 'var(--border-gold)'
          el.style.transform = 'translateY(0)'
          el.style.boxShadow = isFirst ? '0 0 28px rgba(212,160,23,0.15)' : 'none'
        }}
      >
        {/* 사진 */}
        <div style={{ position: 'relative', height: '200px', background: '#0d0d0d' }}>
          <img
            src={getImageUrl(photo.file_key)}
            alt={photo.description ?? ''}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
          {isFirst && (
            <div style={{
              position: 'absolute', top: '10px', right: '10px',
              background: 'rgba(255,192,203,0.22)', border: '1px solid rgba(255,192,203,0.55)',
              color: '#ffcce0', fontSize: '0.58rem', letterSpacing: '0.2em', fontWeight: 700,
              padding: '4px 10px', borderRadius: '100px',
            }}>
              ✦ 이달의 모델
            </div>
          )}
        </div>

        {/* 텍스트 */}
        <div style={{ padding: '16px 18px', textAlign: align === 'right' ? 'right' : 'left' }}>
          <div style={{ fontSize: '0.58rem', letterSpacing: '0.22em', color: 'var(--gold-dark)', marginBottom: '4px' }}>
            {formatYearMonth(photo.taken_date)}
          </div>
          <h2 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-main)', lineHeight: 1.35, marginBottom: '6px' }}>
            {photo.hero_title ?? (photo.description ?? formatYearMonth(photo.taken_date) + ' 모델')}
          </h2>
          {photo.hero_desc && (
            <p style={{ fontSize: '0.7rem', color: 'var(--text-sub)', lineHeight: 1.55, marginBottom: '8px' }}>{photo.hero_desc}</p>
          )}
          <div style={{ display: 'flex', gap: '5px', justifyContent: align === 'right' ? 'flex-end' : 'flex-start', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.58rem', color: '#ffcce0', background: 'rgba(255,192,203,0.1)', border: '1px solid rgba(255,192,203,0.28)', padding: '2px 8px', borderRadius: '100px', fontWeight: 700 }}>✦ 이달의 모델</span>
            {isFirst && (
              <span style={{ fontSize: '0.58rem', color: 'var(--gold-mid)', background: 'rgba(212,160,23,0.1)', border: '1px solid var(--border-gold)', padding: '2px 8px', borderRadius: '100px', fontWeight: 700 }}>현재</span>
            )}
          </div>
          {photo.music_key && (
            <div style={{ marginTop: '8px', fontSize: '0.62rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', justifyContent: align === 'right' ? 'flex-end' : 'flex-start' }}>
              <span>🎵</span>
              <span>개화(開花) — LEGION THEME</span>
            </div>
          )}
        </div>
      </div>
    </a>
  )
}

function FutureCard({ month }: { month: string }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.015)',
      border: '1px dashed rgba(255,255,255,0.08)',
      borderRadius: '14px',
      height: '260px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '8px',
    }}>
      <span style={{ fontSize: '1.6rem', color: 'rgba(255,255,255,0.12)' }}>+</span>
      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{formatYearMonth(month)} 모델 예정</span>
      <span style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.2)' }}>갤러리 업로드 후 자동 등록</span>
    </div>
  )
}

export default function ModelArchivePage() {
  const router = useRouter()
  const [models, setModels] = useState<Photo[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (getAdminRole() !== 'super') {
      router.replace('/')
      return
    }
    galleryApi.getAllFeatured()
      .then(setModels)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [router])

  // 타임라인 항목 생성: 기존 모델 + 앞으로 2개월 예정
  const timelineItems: TimelineItem[] = (() => {
    if (models.length === 0) return []
    const latestMonth = models[0].taken_date.slice(0, 7)
    return [
      ...models.map(m => ({ type: 'model' as const, data: m, month: m.taken_date.slice(0, 7) })),
      { type: 'future' as const, month: addMonths(latestMonth, 1) },
      { type: 'future' as const, month: addMonths(latestMonth, 2) },
    ]
  })()

  return (
    <div style={{ maxWidth: '860px', margin: '0 auto', padding: '0 20px 80px' }}>
      {/* 헤더 */}
      <div style={{ textAlign: 'center', padding: '52px 0 44px' }}>
        <div style={{ fontSize: '0.6rem', letterSpacing: '0.35em', color: 'var(--gold-dark)', marginBottom: '4px' }}>✦ ─────── ✦</div>
        <div style={{ fontSize: '0.62rem', letterSpacing: '0.4em', color: 'var(--gold-mid)', marginBottom: '2px', marginTop: '8px' }}>성심당 &nbsp;·&nbsp; LEGION</div>
        <h1 style={{ fontSize: '1.9rem', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '0.05em', margin: '12px 0 6px' }}>이달의 모델 아카이브</h1>
        <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>레기온이 선정한 역대 이달의 모델</p>
        <div style={{ fontSize: '0.6rem', letterSpacing: '0.35em', color: 'var(--gold-dark)', marginTop: '12px' }}>✦ ─────── ✦</div>
      </div>

      {loading ? (
        <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '60px 0' }}>불러오는 중...</p>
      ) : models.length === 0 ? (
        <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '60px 0' }}>등록된 이달의 모델이 없습니다.</p>
      ) : (
        <>
          {/* ── 타임라인 ── */}
          <div style={{ position: 'relative', paddingTop: '16px' }}>

            {/* 세로 중심선 */}
            <div style={{
              position: 'absolute',
              left: '50%',
              top: 0,
              bottom: 0,
              width: '1px',
              transform: 'translateX(-50%)',
              background: 'linear-gradient(to bottom, transparent 0%, var(--border-gold) 8%, var(--border-gold) 92%, transparent 100%)',
              zIndex: 0,
            }} />

            {timelineItems.map((item, idx) => {
              const isLeft = idx % 2 === 0
              const isFirst = idx === 0

              return (
                <div
                  key={item.month}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 72px 1fr',
                    alignItems: 'center',
                    marginBottom: '36px',
                    gap: '0',
                  }}
                >
                  {/* 왼쪽 */}
                  <div style={{ paddingRight: '20px' }}>
                    {isLeft ? (
                      item.type === 'model'
                        ? <ModelCard photo={item.data} isFirst={isFirst} align="right" />
                        : <FutureCard month={item.month} />
                    ) : null}
                  </div>

                  {/* 중앙 월 버블 */}
                  <div style={{ display: 'flex', justifyContent: 'center', zIndex: 1 }}>
                    <div style={{
                      width: '44px',
                      height: '44px',
                      borderRadius: '50%',
                      background: isFirst ? 'var(--gold-mid)' : 'var(--bg-card)',
                      border: '2px solid ' + (isFirst ? 'var(--gold-mid)' : 'var(--border-gold)'),
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.65rem',
                      fontWeight: 700,
                      color: isFirst ? 'var(--bg-base)' : 'var(--text-sub)',
                      letterSpacing: '0.04em',
                      flexShrink: 0,
                      boxShadow: isFirst ? '0 0 16px rgba(212,160,23,0.35)' : 'none',
                    }}>
                      {getMonthLabel(item.month)}
                    </div>
                  </div>

                  {/* 오른쪽 */}
                  <div style={{ paddingLeft: '20px' }}>
                    {!isLeft ? (
                      item.type === 'model'
                        ? <ModelCard photo={item.data} isFirst={isFirst} align="left" />
                        : <FutureCard month={item.month} />
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>

          {/* 하단 안내 */}
          <div style={{
            marginTop: '12px',
            padding: '22px 28px',
            background: 'var(--bg-card)',
            border: '1px solid var(--border-dark)',
            borderRadius: '12px',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: '0.65rem', color: 'var(--gold-dark)', letterSpacing: '0.18em', marginBottom: '8px', fontWeight: 700 }}>이후의 아카이브</div>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.85 }}>
              6개월 후엔 3월~8월 모델이 이 타임라인에 가득 채워집니다.<br />
              레기온의 역사가 자연스럽게 쌓이는 구조입니다.
            </p>
          </div>
        </>
      )}
    </div>
  )
}
