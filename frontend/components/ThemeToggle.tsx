'use client'

import { useTheme } from './ThemeProvider'

export default function ThemeToggle() {
  const { theme, toggle } = useTheme()
  const isDark = theme === 'dark'

  // 8개 광선 좌표 계산 (중심 10,10 기준)
  const rays = Array.from({ length: 8 }, (_, i) => {
    const angle = (i * 45 * Math.PI) / 180
    return {
      x1: 10 + 6.2 * Math.sin(angle),
      y1: 10 - 6.2 * Math.cos(angle),
      x2: 10 + 8.4 * Math.sin(angle),
      y2: 10 - 8.4 * Math.cos(angle),
    }
  })

  return (
    <button
      onClick={toggle}
      title={isDark ? '라이트 모드로 전환' : '다크 모드로 전환'}
      style={{
        background: 'none',
        border: '1px solid var(--border-gold)',
        borderRadius: '999px',
        padding: '6px',
        width: '34px',
        height: '34px',
        cursor: 'pointer',
        color: 'var(--gold-mid)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'background 0.2s',
        flexShrink: 0,
      }}
      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(212,160,23,0.1)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'none')}
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 20 20"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ overflow: 'visible', display: 'block' }}
      >
        {/* ── 본체 원 ── */}
        <circle cx="10" cy="10" r="4" fill="currentColor" />

        {/* ── 크레센트 마스크: 헤더 배경색 원이 슬라이드 인/아웃되어 초승달 생성 ── */}
        <circle
          cx="10"
          cy="10"
          r="3.4"
          fill="var(--bg-header)"
          style={{
            transform: isDark
              ? 'translate(2.8px, -2.4px)'   // 달 모드: 본체 원 오른쪽 위를 가림
              : 'translate(16px, -16px)',     // 해 모드: 화면 밖으로 이동
            opacity: isDark ? 1 : 0,
            transition: 'transform 0.5s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.45s ease',
          }}
        />

        {/* ── 8개 광선 (해 모드에서만 표시) ── */}
        {rays.map((ray, i) => (
          <line
            key={i}
            x1={ray.x1}
            y1={ray.y1}
            x2={ray.x2}
            y2={ray.y2}
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            style={{
              opacity: isDark ? 0 : 1,
              transition: isDark
                ? `opacity 0.15s ease ${i * 0.02}s`                   // 달로 전환: 빠르게 사라짐
                : `opacity 0.35s ease ${0.18 + i * 0.03}s`,           // 해로 전환: 순차적으로 나타남
            }}
          />
        ))}
      </svg>
    </button>
  )
}
