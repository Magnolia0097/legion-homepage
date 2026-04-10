'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { memberApi, siteSettingsApi, type SiteSettings } from '@/lib/api'
import { renderHtml } from '@/components/RichTextEditor'
import type { Member } from '@/types'

// 홈 화면에 표시할 주요 직급 (이 목록에 없는 직급은 홈에서 숨김)
const FEATURED_ROLES = ['군단장', '엘리트장교', '명예장교']

const ROLE_ORDER: Record<string, number> = {
  '군단장': 0,
  '엘리트장교': 1,
  '명예장교': 2,
}

const ROLE_ICON: Record<string, string> = {
  '군단장': '👑',
  '엘리트장교': '🗡️',
  '명예장교': '🎖️',
}

const ROLE_COLOR: Record<string, string> = {
  '군단장': 'var(--gold-light)',
  '엘리트장교': '#e0a0a0',
  '명예장교': '#c8a8e8',
}

const ROLE_DESC: Record<string, string> = {
  '군단장': '성심당의 군단장이다 ...!',
  '엘리트장교': '성심당의 엘리트장교이다 ....!',
  '명예장교': '전 엘리트장교 또는 성심당 레기온에 큰 기여를 한 인원들이다. 아무런 권한은 없지만 비공식적으로 엘리트장교와 동등한 영향력을 가지고있다고 한다...!',
}

// ── 바텀 시트 / 중앙 모달 (반응형) ──
function BottomSheet({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 768

  useEffect(() => {
    history.pushState({ sheetOpen: true }, '')
    let closedByBack = false
    const handlePopState = () => {
      closedByBack = true
      onClose()
    }
    window.addEventListener('popstate', handlePopState)
    return () => {
      window.removeEventListener('popstate', handlePopState)
      if (!closedByBack) history.back()
    }
  }, [onClose])

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9000,
        background: 'rgba(0,0,0,0.65)',
        display: 'flex',
        alignItems: isDesktop ? 'center' : 'flex-end',
        justifyContent: 'center',
        padding: isDesktop ? '20px' : '0',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: isDesktop ? '600px' : undefined,
          maxHeight: '80vh',
          background: 'var(--bg-card)',
          borderRadius: isDesktop ? '16px' : '20px 20px 0 0',
          border: '1px solid var(--border-gold)',
          borderBottom: isDesktop ? '1px solid var(--border-gold)' : 'none',
          padding: isDesktop ? '28px 32px 32px' : '8px 24px 48px',
          overflowY: 'auto',
          position: 'relative',
        }}
      >
        {/* PC: X 닫기 버튼 */}
        {isDesktop && (
          <button
            onClick={onClose}
            style={{
              position: 'absolute', top: '16px', right: '16px',
              background: 'none', border: 'none',
              color: 'var(--text-muted)', fontSize: '18px',
              cursor: 'pointer', lineHeight: 1,
              padding: '4px 8px', borderRadius: '4px',
              transition: 'color 0.15s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--gold-light)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)' }}
          >
            ✕
          </button>
        )}

        {/* 모바일: 드래그 핸들 */}
        {!isDesktop && (
          <div style={{
            width: '40px', height: '4px',
            background: 'var(--border-gold)',
            borderRadius: '2px',
            margin: '12px auto 20px',
            opacity: 0.6,
          }} />
        )}

        {children}
      </div>
    </div>,
    document.body
  )
}

function NicknameLabel({ member }: { member: Member }) {
  const [open, setOpen] = useState(false)

  if (!member.bio) {
    return (
      <span style={{ color: 'var(--text-main)', whiteSpace: 'nowrap' }}>
        {member.nickname}
      </span>
    )
  }

  return (
    <>
      <span
        onClick={() => setOpen(true)}
        style={{
          color: 'var(--text-main)',
          borderBottom: '1px dashed var(--text-muted)',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        {member.nickname}
      </span>
      {open && (
        <BottomSheet onClose={() => setOpen(false)}>
          <p style={{ fontSize: '18px', fontWeight: 800, color: 'var(--gold-light)', marginBottom: '14px', letterSpacing: '0.04em' }}>
            {member.nickname}
          </p>
          <div
            style={{ fontSize: '14px', color: 'var(--text-sub)', lineHeight: 1.75 }}
            dangerouslySetInnerHTML={{ __html: renderHtml(member.bio) }}
          />
        </BottomSheet>
      )}
    </>
  )
}

function RoleLabel({ role }: { role: string }) {
  const [open, setOpen] = useState(false)
  const desc = ROLE_DESC[role]

  return (
    <>
      <span
        onClick={desc ? () => setOpen(true) : undefined}
        style={{ display: 'inline-block', position: 'relative', width: '5rem' }}
      >
        <span
          className="text-xs font-bold whitespace-nowrap"
          style={{
            color: ROLE_COLOR[role] ?? 'var(--text-sub)',
            textShadow: role === '군단장' ? '0 0 8px rgba(245,200,66,0.4)' : 'none',
            borderBottom: desc ? '1px dashed currentColor' : 'none',
            opacity: desc ? 1 : 0.8,
            cursor: desc ? 'pointer' : 'default',
          }}
        >
          {role}
        </span>
      </span>
      {desc && open && (
        <BottomSheet onClose={() => setOpen(false)}>
          <p style={{ fontSize: '18px', fontWeight: 800, color: ROLE_COLOR[role] ?? 'var(--gold-light)', marginBottom: '14px', letterSpacing: '0.04em' }}>
            {role}
          </p>
          <p style={{ fontSize: '14px', color: 'var(--text-sub)', lineHeight: 1.75 }}>
            {desc}
          </p>
        </BottomSheet>
      )}
    </>
  )
}

export default function HomePage() {
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [settings, setSettings] = useState<SiteSettings>({ join_conditions: '', join_method: '' })
  function loadMembers() {
    setLoading(true)
    setError(false)
    memberApi.getAll()
      .then((data) => {
        if (!Array.isArray(data)) throw new Error('invalid response')
        setMembers(data)
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadMembers()
    siteSettingsApi.get().then(setSettings).catch(() => {})
  }, [])

  const grouped = members.reduce<Record<string, Member[]>>((acc, m) => {
    ; (acc[m.role] ??= []).push(m)
    return acc
  }, {})

  const roles = Object.keys(grouped)
    .filter(r => FEATURED_ROLES.includes(r))
    .sort((a, b) => (ROLE_ORDER[a] ?? 99) - (ROLE_ORDER[b] ?? 99))

  return (
    <>
        {/* ── 새 디자인 ── */}
        <div style={{ width: '100%', background: 'var(--bg-base)' }}>

          {/* 타이틀 섹션 */}
          <div style={{
            textAlign: 'center',
            padding: '56px 40px 56px',
            borderBottom: '1px solid var(--border-gold)',
          }}>
            <div style={{ fontSize: '0.62rem', letterSpacing: '0.3em', color: 'var(--gold-dark)', marginBottom: '6px' }}>✦ ─────── ✦</div>
            <div style={{ fontSize: '0.68rem', letterSpacing: '0.42em', color: 'var(--gold-mid)', marginBottom: '3px' }}>성심당</div>
            <div style={{ fontSize: '0.52rem', letterSpacing: '0.32em', color: 'var(--text-muted)', marginBottom: '28px' }}>A&nbsp;I&nbsp;O&nbsp;N&nbsp;&nbsp;2</div>
            <h1 style={{ fontSize: '2.6rem', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '0.06em', marginBottom: '10px' }}>나니아 성심당</h1>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-sub)', letterSpacing: '0.14em' }}>친목 &nbsp;·&nbsp; 라이트유저 &nbsp;·&nbsp; 매너 플레이</p>
            <div style={{ fontSize: '0.62rem', letterSpacing: '0.3em', color: 'var(--gold-dark)', marginTop: '10px' }}>✦ ─────── ✦</div>
          </div>

          {/* 콘텐츠 영역 */}
          <div style={{ maxWidth: '760px', margin: '0 auto', padding: '40px 40px 0' }}>

            {/* 주요 멤버 목록 */}
            <p style={{ fontSize: '0.65rem', letterSpacing: '0.28em', color: 'var(--gold-mid)', textAlign: 'center', marginBottom: '18px' }}>주요 멤버 목록</p>
            {loading ? (
              <p style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)', fontSize: '14px' }}>불러오는 중...</p>
            ) : error ? (
              <div style={{ textAlign: 'center', padding: '32px 0' }}>
                <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '12px' }}>멤버 정보를 불러오지 못했습니다.</p>
                <button
                  onClick={loadMembers}
                  style={{
                    background: 'none', border: '1px solid var(--border-gold)', borderRadius: '6px',
                    padding: '6px 18px', fontSize: '13px', color: 'var(--gold-mid)', cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >다시 시도</button>
              </div>
            ) : members.length === 0 ? (
              <p style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)', fontSize: '14px' }}>등록된 멤버가 없습니다.</p>
            ) : (
              <div style={{ border: '1px solid var(--border-gold)', borderRadius: '10px', overflow: 'hidden', marginBottom: '40px', background: 'var(--bg-card)' }}>
                {roles.map((role, idx) => (
                  <div
                    key={role}
                    style={{
                      display: 'flex', alignItems: 'center',
                      padding: '15px 22px', gap: '16px',
                      borderBottom: idx < roles.length - 1 ? '1px solid var(--border-dark)' : 'none',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(212,160,23,0.05)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>{ROLE_ICON[role] ?? '•'}</span>
                    <RoleLabel role={role} />
                    <span style={{
                      color: 'var(--text-main)',
                      fontSize: '0.82rem',
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      gap: '4px',
                      flex: 1,
                      minWidth: 0,
                    }}>
                      {grouped[role]?.map((m, i) => (
                        <span key={m.nickname} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          {i > 0 && <span style={{ color: 'var(--gold-dark)', flexShrink: 0 }}>·</span>}
                          <NicknameLabel member={m} />
                        </span>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* 가입 조건 */}
            {(settings.join_conditions || settings.join_method) && (
              <>
                <p style={{ fontSize: '0.65rem', letterSpacing: '0.28em', color: 'var(--gold-mid)', textAlign: 'center', marginBottom: '18px' }}>가입 조건</p>
                <div style={{ border: '1px solid var(--border-gold)', borderRadius: '10px', overflow: 'hidden', marginBottom: '60px', background: 'var(--bg-card)' }}>
                  {settings.join_conditions && (
                    <div style={{
                      display: 'flex', alignItems: 'flex-start',
                      padding: '15px 22px', gap: '20px',
                      borderBottom: settings.join_method ? '1px solid var(--border-dark)' : 'none',
                    }}>
                      <span style={{ fontSize: '1rem', flexShrink: 0, marginTop: '1px' }}>📋</span>
                      <span style={{ color: 'var(--gold-mid)', fontSize: '0.82rem', fontWeight: 600, flexShrink: 0, width: '70px' }}>가입 조건</span>
                      <span style={{ color: 'var(--text-main)', fontSize: '0.82rem', lineHeight: '1.6' }}>{settings.join_conditions}</span>
                    </div>
                  )}
                  {settings.join_method && (
                    <div style={{ display: 'flex', alignItems: 'flex-start', padding: '15px 22px', gap: '20px' }}>
                      <span style={{ fontSize: '1rem', flexShrink: 0, marginTop: '1px' }}>💬</span>
                      <span style={{ color: 'var(--gold-mid)', fontSize: '0.82rem', fontWeight: 600, flexShrink: 0, width: '70px' }}>가입 방법</span>
                      <span style={{ color: 'var(--text-main)', fontSize: '0.82rem', lineHeight: '1.6' }}>{settings.join_method}</span>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

        </div>
    </>
  )
}
