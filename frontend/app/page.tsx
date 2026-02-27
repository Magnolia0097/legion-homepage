'use client'

import { useEffect, useRef, useState } from 'react'
import { memberApi } from '@/lib/api'
import type { Member } from '@/types'
import LegionIcon from '@/components/LegionIcon'

const ROLE_ORDER: Record<string, number> = {
  '군단장': 0,
  '엘리트장교': 1,
  '명예장교': 2,
  '장교': 3,
  '단원': 4,
}

const ROLE_ICON: Record<string, string> = {
  '군단장': '👑',
  '엘리트장교': '🗡️',
  '명예장교': '🎖️',
  '장교': '🛡️',
  '단원': '⚙️',
}

const ROLE_COLOR: Record<string, string> = {
  '군단장': 'var(--gold-light)',
  '엘리트장교': '#e0a0a0',
  '명예장교': '#c8a8e8',
  '장교': '#a0c0e0',
  '단원': 'var(--text-sub)',
}

const ROLE_DESC: Record<string, string> = {
  '군단장': '성심당의 군단장이다...!',
  '엘리트장교': '성심당의 엘리트장교다 ....!',
  '명예장교': '성심당의 엘리트장교였으나, 훌륭한 복무 이후 권력의 자리를 양도한 명예장교들이다...! 비공식적으로 엘리트장교와 동등한 힘을 가지고있다...!',
}

function RoleLabel({ role }: { role: string }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const desc = ROLE_DESC[role]
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const spanRef = useRef<HTMLSpanElement>(null)

  const show = () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (spanRef.current) {
      const r = spanRef.current.getBoundingClientRect()
      setPos({ x: r.left + r.width / 2, y: r.top })
    }
  }
  const hide = () => {
    timerRef.current = setTimeout(() => setPos(null), 120)
  }

  return (
    <span
      ref={spanRef}
      onMouseEnter={show}
      onMouseLeave={hide}
      style={{ display: 'inline-block', position: 'relative' }}
    >
      <span
        className="text-xs font-bold w-20 whitespace-nowrap cursor-default"
        style={{
          color: ROLE_COLOR[role] ?? 'var(--text-sub)',
          textShadow: role === '군단장' ? '0 0 8px rgba(245,200,66,0.4)' : 'none',
          borderBottom: desc ? '1px dashed currentColor' : 'none',
          opacity: desc ? 1 : 0.8,
        }}
      >
        {role}
      </span>
      {desc && pos && (
        <span
          style={{
            position: 'fixed',
            left: `${pos.x}px`,
            top: `${pos.y - 8}px`,
            transform: 'translate(-50%, -100%)',
            background: 'var(--bg-card)',
            border: '1px solid var(--border-gold)',
            borderRadius: '6px',
            padding: '7px 10px',
            fontSize: '11px',
            lineHeight: '1.5',
            color: 'var(--text-sub)',
            whiteSpace: 'normal',
            width: '200px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
            zIndex: 9999,
            pointerEvents: 'none',
          }}
        >
          {desc}
          <span style={{
            position: 'absolute',
            top: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            width: 0,
            height: 0,
            borderLeft: '6px solid transparent',
            borderRight: '6px solid transparent',
            borderTop: '6px solid var(--border-gold)',
          }} />
        </span>
      )}
    </span>
  )
}

export default function HomePage() {
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    memberApi.getAll()
      .then(setMembers)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const grouped = members.reduce<Record<string, Member[]>>((acc, m) => {
    ;(acc[m.role] ??= []).push(m)
    return acc
  }, {})

  const roles = Object.keys(grouped).sort(
    (a, b) => (ROLE_ORDER[a] ?? 99) - (ROLE_ORDER[b] ?? 99)
  )

  return (
    <div className="space-y-10">
      {/* 히어로 섹션 */}
      <section className="text-center py-14 relative">
        {/* 상단 장식선 */}
        <div className="text-xs tracking-widest mb-6" style={{ color: 'var(--gold-dark)' }}>
          ✦ ─────────────────── ✦
        </div>

        {/* 레기온 아이콘 */}
        <div className="flex justify-center mb-3">
          <LegionIcon
            size={160}
            style={{
              filter: 'drop-shadow(0 0 16px rgba(245,200,66,0.45))',
              animation: 'shimmer 2.5s ease-in-out infinite',
              color: 'var(--gold-light)',
            }}
          />
        </div>

        {/* 타이틀 */}
        <h1
          className="text-5xl font-black mb-3 tracking-wide"
          style={{
            background: 'linear-gradient(180deg, var(--gold-light) 0%, var(--gold-mid) 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          나니아 성심당
        </h1>
        <p className="text-base tracking-wide" style={{ color: 'var(--text-sub)' }}>
          친목, 라이트유저, 매너 플레이 ! 나니아 성심당입니다
        </p>

        {/* 하단 장식선 */}
        <div className="text-xs tracking-widest mt-6" style={{ color: 'var(--gold-dark)' }}>
          ✦ ─────────────────── ✦
        </div>
      </section>

      {/* 멤버 목록 */}
      <section>
        {/* 섹션 타이틀 */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, transparent, var(--border-gold))' }} />
          <span className="text-xs font-bold tracking-widest uppercase" style={{ color: 'var(--gold-mid)' }}>
            멤버 목록
          </span>
          <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, var(--border-gold), transparent)' }} />
        </div>

        {/* 멤버 테이블 */}
        {loading ? (
          <p className="text-center py-8" style={{ color: 'var(--text-muted)' }}>불러오는 중...</p>
        ) : members.length === 0 ? (
          <p className="text-center py-8" style={{ color: 'var(--text-muted)' }}>등록된 멤버가 없습니다.</p>
        ) : (
          <div
            className="rounded-lg overflow-hidden"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-gold)' }}
          >
            {roles.map((role, idx) => (
              <div
                key={role}
                className="flex items-center gap-5 px-6 py-4 transition-colors duration-200"
                style={{
                  borderBottom: idx < roles.length - 1 ? '1px solid var(--border-dark)' : 'none',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(212,160,23,0.05)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                {/* 역할 아이콘 */}
                <span className="text-lg w-7 text-center">
                  {ROLE_ICON[role] ?? '•'}
                </span>

                {/* 역할명 */}
                <RoleLabel role={role} />

                {/* 구분선 */}
                <div className="w-px h-7" style={{ background: 'var(--border-gold)' }} />

                {/* 멤버 이름 */}
                <span className="text-sm flex-1" style={{ color: 'var(--text-main)' }}>
                  {grouped[role]?.map((m, i) => (
                    <span key={m.nickname}>
                      {i > 0 && (
                        <span className="mx-2" style={{ color: 'var(--gold-dark)' }}>·</span>
                      )}
                      {m.nickname}
                    </span>
                  ))}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
