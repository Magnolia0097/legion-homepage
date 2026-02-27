'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import LegionIcon from '@/components/LegionIcon'
import ThemeToggle from '@/components/ThemeToggle'

const navLinks = [
  { href: '/', label: '홈' },
  { href: '/notice', label: '공지사항' },
  { href: '/gallery', label: '사진첩' },
]

function isActive(pathname: string, href: string) {
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(href + '/')
}

export default function Header() {
  const pathname = usePathname()

  return (
    <header style={{ background: 'var(--bg-header)', borderBottom: '2px solid var(--gold-dark)', position: 'sticky', top: 0, zIndex: 100 }}>
      {/* 상단 골드 라인 */}
      <div style={{ height: '3px', background: 'linear-gradient(90deg, transparent, var(--gold-mid), var(--gold-light), var(--gold-mid), transparent)' }} />
      <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
        <Link
          href="/"
          className="flex items-center gap-2 text-xl font-black tracking-widest"
          style={{ color: 'var(--gold-light)', textShadow: '0 0 20px rgba(245,200,66,0.4)', textDecoration: 'none' }}
        >
          <LegionIcon size={52} style={{ filter: 'drop-shadow(0 0 6px rgba(245,200,66,0.5))' }} />
        </Link>
        <nav className="flex gap-1 items-center text-sm font-semibold">
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
          <Link
            href="/admin/members"
            className="px-3 py-1.5 rounded transition-all duration-200 text-xs"
            style={{ color: 'var(--text-muted)', border: '1px solid transparent', textDecoration: 'none' }}
          >
            관리자
          </Link>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  )
}
