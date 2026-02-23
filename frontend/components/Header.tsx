'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const navLinks = [
  { href: '/', label: '홈' },
  { href: '/notice', label: '공지사항' },
  { href: '/gallery', label: '사진첩' },
]

export default function Header() {
  const pathname = usePathname()

  return (
    <header className="bg-gray-900 text-white shadow-md">
      <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
        <Link href="/" className="text-xl font-bold tracking-wide text-amber-400 hover:text-amber-300">
          ⚔ 레기온
        </Link>
        <nav className="flex gap-6 text-sm font-medium">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`hover:text-amber-300 transition-colors ${
                pathname === link.href ? 'text-amber-400 border-b border-amber-400' : 'text-gray-300'
              }`}
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/admin/login"
            className="text-gray-500 hover:text-gray-300 transition-colors text-xs"
          >
            관리자
          </Link>
        </nav>
      </div>
    </header>
  )
}
