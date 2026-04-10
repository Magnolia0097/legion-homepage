'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { isLoggedIn, getDisplayNickname, getAdminRole, logout } from '@/lib/firebase'

const tabs = [
  {
    href: '/notice',
    label: '공지사항',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={{ width: 22, height: 22 }}>
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
    ),
  },
  {
    href: '/event',
    label: '이벤트',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={{ width: 22, height: 22 }}>
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    ),
  },
  {
    href: '/gallery',
    label: '갤러리',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={{ width: 22, height: 22 }}>
        <rect x="2" y="6" width="20" height="14" rx="2" />
        <circle cx="12" cy="13" r="3" />
        <path d="M8 6V4h8v2" />
      </svg>
    ),
  },
  {
    href: '/members',
    label: '멤버',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={{ width: 22, height: 22 }}>
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    href: '/game',
    label: '게임',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={{ width: 22, height: 22 }}>
        <rect x="2" y="4" width="20" height="16" rx="2" />
        <path d="M12 4v16" />
        <path d="M8 8h.01" />
        <path d="M16 16h.01" />
      </svg>
    ),
  },
]

function isActive(pathname: string, href: string) {
  if (href === '/game') return pathname === '/game' || pathname.startsWith('/game/') || pathname === '/marble' || pathname.startsWith('/marble?') || pathname === '/rpg' || pathname.startsWith('/rpg/')
  return pathname === href || pathname.startsWith(href + '/')
}

export default function BottomNav() {
  const pathname = usePathname()
  const router = useRouter()
  const [loggedIn, setLoggedIn] = useState(false)
  const [nickname, setNickname] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [showLogout, setShowLogout] = useState(false)

  useEffect(() => {
    const logged = isLoggedIn()
    setLoggedIn(logged)
    setNickname(getDisplayNickname())
    setIsAdmin(!!(getAdminRole()))
  }, [pathname])

  async function handleLogout() {
    setShowLogout(false)
    await logout()
    setLoggedIn(false)
    setNickname('')
    setIsAdmin(false)
    router.push('/')
  }

  // 4번째 탭: 관리자 or 사용자 or 로그인
  const profileTab = {
    label: loggedIn ? (isAdmin ? '관리자' : (nickname.slice(0, 4) || '메뉴')) : '로그인',
    href: isAdmin ? '/admin/notice' : '/login',
    icon: isAdmin ? (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={{ width: 22, height: 22 }}>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ) : (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={{ width: 22, height: 22 }}>
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  }

  const allTabs = [...tabs]

  return (
    <>
      {/* 로그아웃 확인 팝업 */}
      {showLogout && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={() => setShowLogout(false)}
        >
          <div
            className="w-full rounded-t-2xl p-6 space-y-4"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-gold)' }}
            onClick={e => e.stopPropagation()}
          >
            <p className="text-center font-semibold" style={{ color: 'var(--text-main)' }}>
              <span style={{ color: 'var(--gold-mid)' }}>{nickname}</span> 로 로그인 중
            </p>
            <button
              onClick={handleLogout}
              className="w-full py-3 rounded-xl font-semibold"
              style={{ background: '#e05050', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '15px' }}
            >
              로그아웃
            </button>
            <button
              onClick={() => setShowLogout(false)}
              className="w-full py-3 rounded-xl font-semibold"
              style={{ background: 'var(--bg-base)', color: 'var(--text-muted)', border: '1px solid var(--border-dark)', cursor: 'pointer', fontFamily: 'inherit', fontSize: '15px' }}
            >
              취소
            </button>
          </div>
        </div>
      )}

      {/* 하단 탭바 — 모바일 전용 */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 flex items-stretch"
        style={{
          background: 'var(--bg-header)',
          borderTop: '1px solid var(--gold-dark)',
          height: '60px',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {/* 일반 탭 3개 */}
        {allTabs.map((tab) => {
          const active = isActive(pathname, tab.href)
          return (
            <a
              key={tab.href}
              href={tab.href}
              className="flex-1 flex flex-col items-center justify-center gap-0.5"
              style={{
                color: active ? 'var(--gold-light)' : 'var(--text-muted)',
                textDecoration: 'none',
                fontSize: '10px',
                fontWeight: active ? 700 : 400,
              }}
            >
              <span style={{ color: active ? 'var(--gold-light)' : 'var(--text-muted)' }}>
                {tab.icon}
              </span>
              <span>{tab.label}</span>
            </a>
          )
        })}

        {/* 4번째 탭: 프로필/관리자/로그인 */}
        {loggedIn && !isAdmin ? (
          // 일반 사용자 로그인 상태 → 탭하면 로그아웃 팝업
          <button
            onClick={() => setShowLogout(true)}
            className="flex-1 flex flex-col items-center justify-center gap-0.5"
            style={{
              color: 'var(--gold-mid)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: '10px',
              fontWeight: 700,
              fontFamily: 'inherit',
            }}
          >
            <span style={{ color: 'var(--gold-mid)' }}>{profileTab.icon}</span>
            <span style={{ maxWidth: '50px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {nickname.slice(0, 5) || '메뉴'}
            </span>
          </button>
        ) : (
          <a
            href={profileTab.href}
            className="flex-1 flex flex-col items-center justify-center gap-0.5"
            style={{
              color: isAdmin ? 'var(--gold-mid)' : 'var(--text-muted)',
              textDecoration: 'none',
              fontSize: '10px',
              fontWeight: isAdmin ? 700 : 400,
            }}
          >
            <span style={{ color: isAdmin ? 'var(--gold-mid)' : 'var(--text-muted)' }}>
              {profileTab.icon}
            </span>
            <span>{profileTab.label}</span>
          </a>
        )}
      </nav>
    </>
  )
}
