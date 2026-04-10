'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import ThemeToggle from '@/components/ThemeToggle'
import { isLoggedIn, getDisplayNickname, logout, initAuthListener } from '@/lib/firebase'

const navLinks = [
  { href: '/notice', label: '공지사항' },
  { href: '/event', label: '이벤트' },
  { href: '/gallery', label: '갤러리' },
  { href: '/members', label: '멤버' },
  { href: '/game', label: '게임' },
]

function isActive(pathname: string, href: string) {
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(href + '/')
}

export default function Header() {
  const pathname = usePathname()
  const router = useRouter()
  const [loggedIn, setLoggedIn] = useState(false)
  const [nickname, setNickname] = useState('')
  const [heroMode, setHeroMode] = useState(false)

  // Firebase 토큰 자동 갱신 (1시간마다) — 앱 전체에서 한 번만 실행
  useEffect(() => { initAuthListener() }, [])

  useEffect(() => {
    setLoggedIn(isLoggedIn())
    setNickname(getDisplayNickname())
  }, [pathname])

  // 최고관리자 히어로 활성 여부 감지 (body[data-hero] 변화 관찰)
  useEffect(() => {
    const check = () => setHeroMode(document.body.getAttribute('data-hero') === '1')
    check()
    const observer = new MutationObserver(check)
    observer.observe(document.body, { attributes: true, attributeFilter: ['data-hero'] })
    return () => observer.disconnect()
  }, [])

  async function handleLogout() {
    await logout()
    setLoggedIn(false)
    setNickname('')
    router.push('/')
  }

  // ── 히어로 모드: 투명 오버레이 헤더 ──
  if (heroMode) {
    return (
      <header className="px-4 md:px-12" style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 200,
        height: '64px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.55), transparent)',
        transition: 'background 0.3s',
      }}>
        <Link href="/" style={{
          display: 'flex', flexDirection: 'column', gap: '1px',
          textDecoration: 'none',
        }}>
          <span style={{ fontSize: '1.25rem', fontWeight: 800, letterSpacing: '0.14em', color: '#fff', lineHeight: 1 }}>성심당</span>
          <span style={{ fontSize: '0.5rem', letterSpacing: '0.35em', color: 'rgba(255,255,255,0.38)', lineHeight: 1 }}>NANIA · AION 2</span>
        </Link>

        {/* PC nav — 모바일에서 숨김 */}
        <nav className="hidden md:flex items-center" style={{ gap: '32px' }}>
          {navLinks.map(link => (
            <Link key={link.href} href={link.href} style={{
              fontSize: '0.8rem', color: 'rgba(255,255,255,0.65)',
              textDecoration: 'none', letterSpacing: '0.04em',
            }}>{link.label}</Link>
          ))}
          {loggedIn ? (
            <>
              <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>{nickname}</span>
              <button onClick={handleLogout} style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: '0.75rem', color: 'rgba(255,255,255,0.45)', fontFamily: 'inherit',
              }}>로그아웃</button>
            </>
          ) : (
            <Link href="/login" style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.45)', textDecoration: 'none' }}>로그인</Link>
          )}
          <Link href="/admin/members" style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.45)', textDecoration: 'none' }}>관리자</Link>
          {/* ThemeToggle: 히어로 모드에서 흰색 아이콘으로 오버라이드 */}
          <div style={{
            '--gold-mid': '#fff',
            '--border-gold': 'rgba(255,255,255,0.35)',
            '--bg-header': '#050508',
          } as React.CSSProperties}>
            <ThemeToggle />
          </div>
        </nav>

        {/* 모바일: ThemeToggle만 표시 */}
        <div className="flex md:hidden items-center" style={{
          '--gold-mid': '#fff',
          '--border-gold': 'rgba(255,255,255,0.35)',
          '--bg-header': '#050508',
        } as React.CSSProperties}>
          <ThemeToggle />
        </div>
      </header>
    )
  }

  // ── 일반 모드: 골드 헤더 (텍스트 브랜딩) ──
  return (
    <header style={{ background: 'var(--bg-header)', borderBottom: '1px solid var(--border-gold)', position: 'sticky', top: 0, zIndex: 100 }}>
      {/* 상단 골드 라인 */}
      <div style={{ height: '2px', background: 'linear-gradient(90deg, transparent, var(--gold-mid), var(--gold-light), var(--gold-mid), transparent)' }} />
      <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
        {/* 로고: 성심당 / NANIA · AION 2 텍스트 브랜딩 */}
        <Link
          href="/"
          style={{ display: 'flex', flexDirection: 'column', gap: '2px', textDecoration: 'none' }}
        >
          <span style={{
            fontSize: '1.2rem', fontWeight: 800, letterSpacing: '0.14em',
            color: 'var(--gold-light)', lineHeight: 1,
            textShadow: '0 0 16px rgba(245,200,66,0.35)',
          }}>성심당</span>
          <span style={{
            fontSize: '0.46rem', letterSpacing: '0.38em',
            color: 'var(--text-muted)', lineHeight: 1,
          }}>NANIA · AION 2</span>
        </Link>
        {/* PC nav — 모바일에서는 숨김 */}
        <nav className="hidden md:flex gap-1 items-center text-sm font-semibold">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="px-3 py-1.5 rounded transition-all duration-200"
              style={{
                color: isActive(pathname, link.href) ? 'var(--gold-light)' : 'var(--text-sub)',
                border: isActive(pathname, link.href) ? '1px solid var(--border-gold)' : '1px solid transparent',
                background: isActive(pathname, link.href) ? 'rgba(212,160,23,0.1)' : 'transparent',
                textDecoration: 'none',
              }}
            >
              {link.label}
            </Link>
          ))}

          {/* 로그인 상태에 따른 버튼 */}
          {loggedIn ? (
            <div className="flex items-center gap-1">
              <span className="px-2 py-1 text-xs" style={{ color: 'var(--gold-mid)', fontWeight: 600 }}>
                {nickname || '멤버'}
              </span>
              <button
                onClick={handleLogout}
                className="px-3 py-1.5 rounded transition-all duration-200 text-xs"
                style={{
                  color: 'var(--text-muted)', border: '1px solid transparent',
                  background: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '12px',
                }}
                onMouseEnter={e => (e.currentTarget.style.color = '#e05050')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
              >
                로그아웃
              </button>
            </div>
          ) : (
            <Link
              href="/login"
              className="px-3 py-1.5 rounded transition-all duration-200 text-xs"
              style={{ color: 'var(--text-muted)', border: '1px solid transparent', textDecoration: 'none' }}
              onMouseEnter={e => {
                const el = e.currentTarget as HTMLAnchorElement
                el.style.color = 'var(--gold-mid)'
                el.style.border = '1px solid var(--border-gold)'
              }}
              onMouseLeave={e => {
                const el = e.currentTarget as HTMLAnchorElement
                el.style.color = 'var(--text-muted)'
                el.style.border = '1px solid transparent'
              }}
            >
              로그인
            </Link>
          )}

          <Link
            href="/admin/members"
            className="px-3 py-1.5 rounded transition-all duration-200 text-xs"
            style={{ color: 'var(--text-muted)', border: '1px solid transparent', textDecoration: 'none' }}
          >
            관리자
          </Link>
          <ThemeToggle />
        </nav>

        {/* 모바일: ThemeToggle만 표시 */}
        <div className="flex md:hidden items-center">
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
