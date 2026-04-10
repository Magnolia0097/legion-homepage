'use client'

import { useEffect, useRef, useState } from 'react'
import { galleryApi, getImageUrl } from '@/lib/api'
import type { Photo } from '@/types'

const R2_BASE = process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? ''

export default function SuperAdminHero() {
  const [featured, setFeatured] = useState<Photo | null | undefined>(undefined)
  const [isPlaying, setIsPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    galleryApi.getFeatured().then(setFeatured).catch(() => setFeatured(null))
  }, [])

  useEffect(() => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = '' }
    if (featured === undefined) return
    const src = featured?.music_key ? (R2_BASE + '/' + featured.music_key) : '/hero-music2.mp3'
    const audio = new Audio(src)
    audio.loop = true
    audioRef.current = audio
    return () => { audio.pause(); audio.src = '' }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [featured?.id])

  function toggleMusic() {
    const a = audioRef.current
    if (!a) return
    if (!isPlaying) { a.play().catch(() => {}); setIsPlaying(true) }
    else { a.pause(); setIsPlaying(false) }
  }

  const heroImageSrc = '/hero-model.png'

  function buildHeroMonth() {
    if (!featured?.taken_date) return '✦ 2026년 3월 · 이달의 모델'
    const parts = featured.taken_date.split('-')
    return '✦ ' + parts[0] + '년 ' + parseInt(parts[1]) + '월 · 이달의 모델'
  }
  const heroMonth = buildHeroMonth()
  const galleryLink = featured?.taken_date
    ? ('/gallery?month=' + featured.taken_date.slice(0, 7))
    : '/gallery?month=2026-03'

  const rawTitle = featured?.hero_title ?? '벚꽃 아래 두 소녀,\n레기온을 물들이다'
  const heroDesc = featured?.hero_desc ?? '벚꽃이 흩날리는 밤, 레기온이 선정한 3월의 모델을 만나보세요.'
  const titleLines = rawTitle.split('\n')
  const titleMain = titleLines.length > 1 ? titleLines.slice(0, -1).join('\n') : ''
  const titlePink = titleLines[titleLines.length - 1]

  const musicSubLabel = featured?.music_key ? '이달의 테마곡' : '개화(開花)'

  const borderColor = isPlaying ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.35)'

  return (
    <>
    <section className="hero-section" style={{
      position: 'relative', width: '100vw', height: '100vh',
      overflow: 'hidden', fontFamily: "'Pretendard', 'Noto Sans KR', sans-serif",
    }}>
      <img
        src={heroImageSrc}
        alt="이달의 모델"
        className="hero-bg-img"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top' }}
      />
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent 25%, rgba(10,8,5,0.45) 60%, rgba(10,8,5,0.92) 100%)' }} />

      {/* 이린 라벨 */}
      <div className="hero-label" style={{ position: 'absolute', left: '7%', top: '38%', display: 'flex', alignItems: 'center', gap: 10, animation: 'heroLabelIn 0.8s ease 0.5s both', zIndex: 3, pointerEvents: 'none' }}>
        <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#fff', flexShrink: 0, boxShadow: '0 0 6px #fff, 0 0 14px rgba(255,255,255,0.6)' }} />
        <div style={{ width: 36, height: 1, background: 'linear-gradient(to right, rgba(255,255,255,0.7), transparent)' }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <span style={{ fontSize: '0.5rem', letterSpacing: '0.22em', color: '#ffb7cc' }}>이달의 모델</span>
          <span style={{ fontSize: '1.1rem', fontWeight: 800, color: '#fff', textShadow: '0 0 20px rgba(255,255,255,0.5), 0 2px 8px rgba(0,0,0,0.6)' }}>이린</span>
          <span style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.18em' }}>IRIN</span>
        </div>
      </div>

      {/* 멍지아 라벨 */}
      <div className="hero-label" style={{ position: 'absolute', right: '3%', top: '22%', display: 'flex', alignItems: 'center', gap: 10, flexDirection: 'row-reverse', animation: 'heroLabelIn 0.8s ease 0.8s both', zIndex: 3, pointerEvents: 'none' }}>
        <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#fff', flexShrink: 0, boxShadow: '0 0 6px #fff, 0 0 14px rgba(255,255,255,0.6)' }} />
        <div style={{ width: 36, height: 1, background: 'linear-gradient(to left, rgba(255,255,255,0.7), transparent)' }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, alignItems: 'flex-end' }}>
          <span style={{ fontSize: '0.5rem', letterSpacing: '0.22em', color: '#ffb7cc' }}>이달의 모델</span>
          <span style={{ fontSize: '1.1rem', fontWeight: 800, color: '#fff', textShadow: '0 0 20px rgba(255,255,255,0.5), 0 2px 8px rgba(0,0,0,0.6)' }}>멍지아</span>
          <span style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.18em' }}>MENGJIA</span>
        </div>
      </div>

      {/* 음악 플레이어 */}
      <div className="hero-music-player" style={{ position: 'absolute', bottom: 52, right: 52, zIndex: 4, display: 'flex', alignItems: 'center', gap: 14 }}>
        <div className="hero-music-text" style={{ display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2.5, height: 14, opacity: isPlaying ? 1 : 0, transition: 'opacity 0.5s' }}>
            {[5, 11, 7, 13, 4].map((h, i) => (
              <div key={i} style={{ width: 2.5, height: h, background: 'rgba(255,255,255,0.75)', borderRadius: 2, animation: isPlaying ? ('heroBounce 0.9s ease-in-out ' + (i * 0.06) + 's infinite') : 'none' }} />
            ))}
          </div>
          <div style={{ fontSize: '0.65rem', letterSpacing: '0.18em', color: 'rgba(255,255,255,0.8)', fontWeight: 600 }}>LEGION THEME</div>
          <div style={{ fontSize: '0.56rem', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.35)' }}>{musicSubLabel}</div>
        </div>
        <button
          onClick={toggleMusic}
          style={{ width: 50, height: 50, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', border: ('1.5px solid ' + borderColor), color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(10px)', animation: isPlaying ? 'heroBtnPulse 2.4s ease-in-out infinite' : 'none', transition: 'border-color 0.3s', flexShrink: 0 }}
        >
          {isPlaying
            ? <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="3" width="5" height="18" rx="1" /><rect x="14" y="3" width="5" height="18" rx="1" /></svg>
            : <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="6,3 20,12 6,21" /></svg>
          }
        </button>
      </div>

      {/* 히어로 텍스트 */}
      <div className="hero-text-panel" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 2, padding: '0 60px 52px' }}>
        <div style={{ display: 'inline-block', background: 'rgba(255,192,203,0.22)', border: '1px solid rgba(255,192,203,0.45)', color: '#ffb7cc', fontSize: '0.68rem', letterSpacing: '0.2em', padding: '5px 14px', borderRadius: '100px', marginBottom: 14, backdropFilter: 'blur(4px)' }}>
          {heroMonth}
        </div>
        <h2 style={{ fontSize: 'clamp(1.4rem, 4vw, 3.4rem)', fontWeight: 800, lineHeight: 1.1, letterSpacing: '-0.02em', color: '#fff', animation: isPlaying ? 'heroTitleGlow 2.4s ease-in-out infinite' : 'none' }}>
          {titleMain && <>{titleMain}<br /></>}
          <span style={{ color: '#ffb7cc' }}>{titlePink}</span>
        </h2>
        <p style={{ marginTop: 10, fontSize: '0.88rem', color: 'rgba(255,255,255,0.58)', maxWidth: 400, lineHeight: 1.7 }}>
          {heroDesc}
        </p>
        <div style={{ marginTop: 24, display: 'flex', gap: 12, alignItems: 'center' }}>
          <a href={galleryLink} style={{ background: '#fff', color: '#0a0a0f', padding: '11px 26px', borderRadius: '100px', fontSize: '0.82rem', fontWeight: 700, textDecoration: 'none', display: 'inline-block' }}>
            갤러리 보기
          </a>
        </div>
      </div>

      <style>{`
        @keyframes heroLabelIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes heroBounce { 0%,100% { transform: scaleY(1); opacity: 0.55; } 50% { transform: scaleY(1.9); opacity: 1; } }
        @keyframes heroBtnPulse { 0%,100% { box-shadow: 0 0 10px rgba(255,255,255,0.2), 0 0 0 0 rgba(255,255,255,0.1); } 50% { box-shadow: 0 0 22px rgba(255,255,255,0.5), 0 0 0 8px rgba(255,255,255,0); } }
        @keyframes heroTitleGlow { 0%,100% { text-shadow: 0 0 16px rgba(255,255,255,0.1); } 50% { text-shadow: 0 0 36px rgba(255,255,255,0.4), 0 0 70px rgba(255,255,255,0.15); } }
        @media (orientation: portrait) { .hero-bg-img { object-position: 35% top; } }
        @media (max-width: 767px) {
          .hero-section { height: 65vh !important; }
          .hero-label { display: none !important; }
          .hero-music-text { display: none !important; }
          .hero-music-player { bottom: auto !important; top: 60px !important; right: 16px !important; }
          .hero-text-panel { display: none !important; }
          .hero-mobile-ext { display: block !important; }
        }
      `}</style>
    </section>

    {/* 모바일 하단 연장 */}
    <div className="hero-mobile-ext" style={{ display: 'none', background: '#0a0805', padding: '22px 20px 36px', marginTop: '-2px', fontFamily: "'Pretendard', 'Noto Sans KR', sans-serif" }}>
      <div style={{ display: 'inline-block', background: 'rgba(255,192,203,0.22)', border: '1px solid rgba(255,192,203,0.45)', color: '#ffb7cc', fontSize: '0.68rem', letterSpacing: '0.2em', padding: '5px 14px', borderRadius: '100px', marginBottom: 14, backdropFilter: 'blur(4px)' }}>
        {heroMonth}
      </div>
      <h2 style={{ fontSize: 'clamp(1.5rem, 6vw, 2.4rem)', fontWeight: 800, lineHeight: 1.15, letterSpacing: '-0.02em', color: '#fff', marginBottom: 10 }}>
        {titleMain && <>{titleMain}<br /></>}
        <span style={{ color: '#ffb7cc' }}>{titlePink}</span>
      </h2>
      <p style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.55)', lineHeight: 1.7, marginBottom: 20 }}>{heroDesc}</p>
      <a href={galleryLink} style={{ background: '#fff', color: '#0a0a0f', padding: '11px 26px', borderRadius: '100px', fontSize: '0.82rem', fontWeight: 700, textDecoration: 'none', display: 'inline-block' }}>
        갤러리 보기
      </a>
    </div>
    </>
  )
}
