'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

function fmtTime(t: number) {
  if (!isFinite(t) || isNaN(t) || t < 0) return '0:00'
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

interface Props {
  src: string
  autoPlay?: boolean
}

export default function AudioPlayer({ src, autoPlay = false }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [muted, setMuted] = useState(false)

  useEffect(() => {
    const a = audioRef.current
    if (!a) return
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    const onEnded = () => { setPlaying(false); setCurrentTime(0) }
    const onTimeUpdate = () => setCurrentTime(a.currentTime)
    const onLoaded = () => { if (isFinite(a.duration)) setDuration(a.duration) }
    a.addEventListener('play', onPlay)
    a.addEventListener('pause', onPause)
    a.addEventListener('ended', onEnded)
    a.addEventListener('timeupdate', onTimeUpdate)
    a.addEventListener('loadedmetadata', onLoaded)
    a.addEventListener('durationchange', onLoaded)
    return () => {
      a.removeEventListener('play', onPlay)
      a.removeEventListener('pause', onPause)
      a.removeEventListener('ended', onEnded)
      a.removeEventListener('timeupdate', onTimeUpdate)
      a.removeEventListener('loadedmetadata', onLoaded)
      a.removeEventListener('durationchange', onLoaded)
    }
  }, [])

  const seekToClientX = useCallback((clientX: number) => {
    const track = trackRef.current
    const a = audioRef.current
    if (!track || !a || !duration) return
    const rect = track.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    a.currentTime = ratio * duration
    setCurrentTime(ratio * duration)
  }, [duration])

  function handleTrackMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    e.preventDefault()
    seekToClientX(e.clientX)
    const onMove = (e: MouseEvent) => seekToClientX(e.clientX)
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  function handleTrackTouchStart(e: React.TouchEvent<HTMLDivElement>) {
    if (e.touches[0]) seekToClientX(e.touches[0].clientX)
    const onMove = (e: TouchEvent) => { if (e.touches[0]) seekToClientX(e.touches[0].clientX) }
    const onEnd = () => {
      document.removeEventListener('touchmove', onMove)
      document.removeEventListener('touchend', onEnd)
    }
    document.addEventListener('touchmove', onMove, { passive: true })
    document.addEventListener('touchend', onEnd)
  }

  function togglePlay() {
    const a = audioRef.current
    if (!a) return
    playing ? a.pause() : a.play()
  }

  function toggleMute() {
    const a = audioRef.current
    if (!a) return
    a.muted = !a.muted
    setMuted(a.muted)
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '10px',
      background: 'var(--bg-card)', border: '1px solid var(--border-gold)',
      borderRadius: '8px', padding: '10px 14px',
    }}>
      <audio ref={audioRef} src={src} autoPlay={autoPlay} />

      {/* ♪ 아이콘 */}
      <span style={{ fontSize: '15px', color: 'var(--gold-mid)', flexShrink: 0 }}>♪</span>

      {/* 재생 / 일시정지 버튼 */}
      <button
        type="button"
        onClick={togglePlay}
        title={playing ? '일시정지' : '재생'}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          padding: 0, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: '22px', height: '22px',
        }}
      >
        {playing ? (
          /* 일시정지 아이콘 — 두 개의 세로 막대 */
          <span style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
            <span style={{ display: 'block', width: '3px', height: '13px', background: 'var(--gold-mid)', borderRadius: '1px' }} />
            <span style={{ display: 'block', width: '3px', height: '13px', background: 'var(--gold-mid)', borderRadius: '1px' }} />
          </span>
        ) : (
          /* 재생 아이콘 — CSS 삼각형 */
          <span style={{
            display: 'block', width: 0, height: 0,
            borderStyle: 'solid',
            borderWidth: '6px 0 6px 11px',
            borderColor: 'transparent transparent transparent var(--gold-mid)',
            marginLeft: '2px',
          }} />
        )}
      </button>

      {/* 현재 시간 / 전체 길이 */}
      <span style={{ fontSize: '11px', color: 'var(--text-muted)', flexShrink: 0, letterSpacing: '0.02em' }}>
        {fmtTime(currentTime)} / {fmtTime(duration)}
      </span>

      {/* 진행 바 */}
      <div
        ref={trackRef}
        onMouseDown={handleTrackMouseDown}
        onTouchStart={handleTrackTouchStart}
        style={{
          flex: 1, height: '4px', background: 'rgba(255,255,255,0.08)',
          borderRadius: '2px', cursor: 'pointer', position: 'relative',
          minWidth: 0, userSelect: 'none',
        }}
      >
        {/* 채워진 부분 */}
        <span style={{
          position: 'absolute', left: 0, top: 0,
          width: `${progress}%`, height: '100%',
          background: 'var(--gold-mid)', borderRadius: '2px',
          pointerEvents: 'none', display: 'block',
        }} />
        {/* 썸 (핸들) */}
        <span style={{
          position: 'absolute', top: '50%', left: `${progress}%`,
          transform: 'translate(-50%, -50%)',
          width: '10px', height: '10px',
          background: 'var(--gold-mid)', borderRadius: '50%',
          boxShadow: '0 0 0 2px var(--bg-card)',
          pointerEvents: 'none', display: 'block',
        }} />
      </div>

      {/* 음소거 버튼 */}
      <button
        type="button"
        onClick={toggleMute}
        title={muted ? '음소거 해제' : '음소거'}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: muted ? 'rgba(255,255,255,0.25)' : 'var(--text-muted)',
          flexShrink: 0, padding: 0,
          display: 'flex', alignItems: 'center',
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          {muted ? (
            <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
          ) : (
            <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
          )}
        </svg>
      </button>
    </div>
  )
}
