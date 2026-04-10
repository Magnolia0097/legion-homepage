'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { logout, getAdminRole, hasPermission, initAuthListener } from '@/lib/firebase'

// 권한별 링크 정의 (permission: null = 최상위만, 'any' = 모든 관리자, 나머지 = 해당 권한 보유자)
const NAV_LINKS = [
  { href: '/admin/members', label: '멤버 관리', permission: null },
  { href: '/admin/notice', label: '공지 관리', permission: 'notice' },
  { href: '/admin/gallery', label: '사진 관리', permission: 'gallery' },
  { href: '/admin/event', label: '이벤트 관리', permission: 'event' },
  { href: '/admin/members', label: '멤버 소개', permission: 'member' },  // 일반 관리자용
  { href: '/admin/invite', label: '초대 링크', permission: null },
]

interface Props {
  title: string
  subtitle?: string
}

export default function AdminHeader({ title, subtitle }: Props) {
  const router = useRouter()
  // localStorage는 hydration 후에만 접근 가능 → useState + useEffect로 읽어야 리렌더 보장
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)

  useEffect(() => {
    setIsSuperAdmin(getAdminRole() === 'super')
    // Firebase 토큰 자동 갱신 리스너 등록 (모든 관리자 페이지 공통)
    initAuthListener()
  }, [])

  // 최상위 관리자: 모든 링크 표시 / 일반 관리자: 해당 권한 링크만
  const visibleLinks = NAV_LINKS.filter((link) => {
    if (isSuperAdmin) return true
    if (link.permission === null) return false          // super-only 링크 숨김
    if (link.permission === 'any') return true          // 모든 관리자 접근 가능
    return hasPermission(link.permission)
  })

  async function handleLogout() {
    await logout()
    router.push('/admin/login')
  }

  return (
    <div className="pb-4" style={{ borderBottom: '1px solid var(--border-dark)' }}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-main)' }}>{title}</h1>
          {subtitle && (
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{subtitle}</p>
          )}
        </div>
        <div className="flex items-center gap-4 flex-wrap justify-end">
          <div className="flex gap-4 text-sm flex-wrap">
            {visibleLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                style={{ color: 'var(--text-muted)', textDecoration: 'none' }}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--gold-mid)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
              >
                {link.label}
              </a>
            ))}
            {isSuperAdmin && (
              <>
                <a
                  href="/admin/users"
                  style={{ color: 'var(--text-muted)', textDecoration: 'none' }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--gold-mid)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
                >
                  사용자 관리
                </a>
                <a
                  href="/admin/accounts"
                  style={{ color: 'var(--text-muted)', textDecoration: 'none' }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--gold-mid)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
                >
                  관리자 관리
                </a>
                <a
                  href="/admin/logs"
                  style={{ color: 'var(--text-muted)', textDecoration: 'none' }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--gold-mid)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
                >
                  활동 로그
                </a>
              </>
            )}
          </div>
          {/* 구분선 */}
          <div style={{ width: '1px', height: '16px', background: 'var(--border-dark)', flexShrink: 0 }} />
          {/* 로그아웃 */}
          <button
            onClick={handleLogout}
            className="text-sm"
            style={{
              background: 'none',
              border: '1px solid var(--border-dark)',
              borderRadius: '5px',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              fontFamily: 'inherit',
              padding: '4px 12px',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = '#e05050'
              e.currentTarget.style.color = '#e05050'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = 'var(--border-dark)'
              e.currentTarget.style.color = 'var(--text-muted)'
            }}
          >
            로그아웃
          </button>
        </div>
      </div>
    </div>
  )
}
