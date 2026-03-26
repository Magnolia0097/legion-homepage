'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { memberApi } from '@/lib/api'
import { renderHtml } from '@/components/RichTextEditor'
import type { Member } from '@/types'

const PLACEHOLDER_MESSAGES = [
  '🔒 기밀 해제 준비 중',
  '👀 행동을 관찰하는 중',
  '🐱 귀를 쫑긋 세우는 중',
  '🕵️ 주미온의 소문 염탐 중',
  '🔍 수소문하는 중',
  '✍️ 관리자가 멘트 고민하는 중',
  '🐾 고양이가 대신 작성 중',
  '💾 데이터 복구 중',
  '🍳 관리자가 요리하는 중',
  '☕ 커피를 엎질러서 다시 작성 중',
  '👁️ 눈알 굴리는 중',
  '🤔 머리를 짚으며 생각하는 중',
  '🍬 마이쮸 포장지 뜯는 중',
  '🌙 밤하늘 구경 중',
  '🎵 노래 흥얼거리는 중',
  '💤 잠깐 낮잠 자는 중',
  '🍜 라면 끓이러 가는 중',
  '📱 쇼츠 보다가 일어나는 중',
  '🎯 핑계 찾는 중',
  '💭 딴생각하는 중',
  '🌴 휴가 계획 짜는 중',
  '🦆 오리처럼 둥실둥실',
  '🔮 미래를 들여다보는 중',
  '🎲 주사위 굴리는 중',
  '🌸 꽃구경하는 중',
  '🐢 천천히 걸어오는 중',
  '🍡 잠깐 간식 사러 나가는 중',
  '🌊 파도소리 듣는 중',
]

const ROLE_CONFIG = [
  { value: '군단장',    label: '군단장',    color: '#d4a017', bg: 'rgba(212,160,23,0.15)',  border: 'rgba(212,160,23,0.4)' },
  { value: '엘리트장교', label: '엘리트장교', color: '#a070d0', bg: 'rgba(160,112,208,0.15)', border: 'rgba(160,112,208,0.4)' },
  { value: '명예장교',  label: '명예장교',  color: '#5090d0', bg: 'rgba(80,144,208,0.15)',  border: 'rgba(80,144,208,0.4)' },
  { value: '군단병',   label: '군단병',   color: '#50a870', bg: 'rgba(80,168,112,0.15)',  border: 'rgba(80,168,112,0.4)' },
]

function getRoleConfig(role: string) {
  return ROLE_CONFIG.find((r) => r.value === role) ?? {
    value: role, label: role,
    color: 'var(--text-muted)', bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.15)',
  }
}

// ── 바텀 시트 / 중앙 모달 (반응형) ──
function BioBottomSheet({ member, cfg, onClose }: {
  member: Member
  cfg: ReturnType<typeof getRoleConfig>
  onClose: () => void
}) {
  const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 768

  useEffect(() => {
    history.pushState({ bioOpen: true }, '')

    let closedByBack = false

    const handlePopState = () => {
      closedByBack = true
      onClose()
    }

    window.addEventListener('popstate', handlePopState)

    return () => {
      window.removeEventListener('popstate', handlePopState)
      if (!closedByBack) {
        history.back()
      }
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

        {/* 헤더 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px', marginTop: isDesktop ? 0 : undefined }}>
          <span style={{
            fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em',
            color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}`,
            borderRadius: '4px', padding: '3px 10px', flexShrink: 0,
          }}>
            {cfg.label}
          </span>
          <span style={{ fontSize: '18px', fontWeight: 800, color: 'var(--gold-light)', letterSpacing: '0.04em' }}>
            {member.nickname}
          </span>
        </div>

        {/* 소개 본문 */}
        <div
          style={{ fontSize: '14px', color: 'var(--text-sub)', lineHeight: 1.75 }}
          dangerouslySetInnerHTML={{ __html: renderHtml(member.bio!) }}
        />
      </div>
    </div>,
    document.body
  )
}

// ── 일반 멤버 카드 ──
function MemberCard({ member }: { member: Member }) {
  const cfg = getRoleConfig(member.role)
  const [open, setOpen] = useState(false)
  const hasBio = !!member.bio
  const [placeholder] = useState(
    () => PLACEHOLDER_MESSAGES[Math.floor(Math.random() * PLACEHOLDER_MESSAGES.length)]
  )

  return (
    <>
      <div
        onClick={() => hasBio && setOpen(true)}
        style={{
          position: 'relative',
          overflow: 'hidden',
          background: 'var(--bg-card)',
          border: `1px solid var(--border-dark)`,
          borderRadius: '12px',
          padding: '16px',
          minHeight: '110px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          cursor: hasBio ? 'pointer' : 'default',
          transition: 'border-color 0.2s',
          userSelect: 'none',
        }}
        onMouseEnter={e => { if (hasBio) e.currentTarget.style.borderColor = cfg.border }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-dark)' }}
      >
        {/* 계급 뱃지 */}
        <span style={{
          display: 'inline-flex', alignSelf: 'flex-start',
          fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em',
          color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}`,
          borderRadius: '4px', padding: '2px 8px',
        }}>
          {cfg.label}
        </span>

        {/* 닉네임 */}
        <p style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--gold-light)', letterSpacing: '0.04em', margin: 0 }}>
          {member.nickname}
        </p>

        {/* 소개 있음: 힌트 */}
        {hasBio && (
          <>
            <div style={{
              position: 'absolute', bottom: 0, left: 0, right: 0,
              height: '3px',
              background: `linear-gradient(90deg, transparent, ${cfg.border}, transparent)`,
              pointerEvents: 'none',
              borderRadius: '0 0 12px 12px',
            }} />
            <p style={{ fontSize: '10px', color: 'var(--text-muted)', margin: 0, fontStyle: 'italic' }}>
              탭하여 소개 보기
            </p>
          </>
        )}

        {/* 소개 없음 */}
        {!hasBio && (
          <p className="placeholder-shimmer" style={{ fontSize: '10px', margin: 0, fontStyle: 'italic', letterSpacing: '0.03em' }}>
            {placeholder}
          </p>
        )}
      </div>

      {/* 바텀 시트 */}
      {hasBio && open && (
        <BioBottomSheet member={member} cfg={cfg} onClose={() => setOpen(false)} />
      )}
    </>
  )
}

// ── 군단장 카드 ──
function CommanderCard({ member }: { member: Member }) {
  const cfg = getRoleConfig(member.role)
  const [open, setOpen] = useState(false)
  const hasBio = !!member.bio
  const [placeholder] = useState(
    () => PLACEHOLDER_MESSAGES[Math.floor(Math.random() * PLACEHOLDER_MESSAGES.length)]
  )

  return (
    <>
      <div
        onClick={() => hasBio && setOpen(true)}
        style={{
          position: 'relative',
          overflow: 'hidden',
          background: 'var(--bg-card)',
          border: `1px solid var(--border-dark)`,
          borderRadius: '14px',
          padding: '24px 28px',
          minHeight: '130px',
          display: 'flex', flexDirection: 'column', gap: '10px',
          maxWidth: '420px', margin: '0 auto',
          cursor: hasBio ? 'pointer' : 'default',
          transition: 'border-color 0.2s',
          userSelect: 'none',
        }}
        onMouseEnter={e => { if (hasBio) e.currentTarget.style.borderColor = cfg.border }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-dark)' }}
      >
        <span style={{
          display: 'inline-flex', alignSelf: 'flex-start',
          fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em',
          color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}`,
          borderRadius: '4px', padding: '3px 10px',
        }}>
          {cfg.label}
        </span>
        <p style={{
          fontSize: '1.4rem', fontWeight: 800, color: 'var(--gold-light)',
          letterSpacing: '0.06em', margin: 0, textShadow: '0 0 20px rgba(212,160,23,0.3)',
        }}>
          {member.nickname}
        </p>

        {hasBio && (
          <>
            <div style={{
              position: 'absolute', bottom: 0, left: 0, right: 0,
              height: '3px',
              background: `linear-gradient(90deg, transparent, ${cfg.border}, transparent)`,
              pointerEvents: 'none',
              borderRadius: '0 0 14px 14px',
            }} />
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0, fontStyle: 'italic' }}>
              탭하여 소개 보기
            </p>
          </>
        )}

        {!hasBio && (
          <p className="placeholder-shimmer" style={{ fontSize: '11px', margin: 0, fontStyle: 'italic' }}>
            {placeholder}
          </p>
        )}
      </div>

      {/* 바텀 시트 */}
      {hasBio && open && (
        <BioBottomSheet member={member} cfg={cfg} onClose={() => setOpen(false)} />
      )}
    </>
  )
}

export default function MembersPage() {
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    memberApi.getAll()
      .then(setMembers)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const grouped = ROLE_CONFIG.map((cfg) => ({
    ...cfg,
    members: members.filter((m) => m.role === cfg.value),
  })).filter((g) => g.members.length > 0)

  return (
    <div>
      {/* 페이지 헤더 */}
      <div style={{ textAlign: 'center', paddingBottom: '28px', marginBottom: '32px', borderBottom: '1px solid var(--border-dark)' }}>
        <p style={{ fontSize: '0.48rem', letterSpacing: '0.4em', color: 'var(--text-muted)', marginBottom: '6px' }}>
          NANIA · AION 2
        </p>
        <h1 style={{ fontSize: '1.8rem', fontWeight: 800, letterSpacing: '0.1em', color: 'var(--gold-light)', textShadow: '0 0 24px rgba(212,160,23,0.3)', margin: 0 }}>
          성심당 멤버
        </h1>
        {!loading && (
          <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '6px' }}>총 {members.length}명</p>
        )}
      </div>

      {/* 멤버 목록 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '40px' }}>
        {loading ? (
          <p style={{ color: 'var(--text-muted)', textAlign: 'center', paddingTop: '40px' }}>불러오는 중…</p>
        ) : members.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', textAlign: 'center', paddingTop: '40px' }}>등록된 멤버가 없습니다.</p>
        ) : (
          grouped.map((group) => (
            <section key={group.value}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.12em', color: group.color, flexShrink: 0 }}>
                  {group.label}
                </span>
                <div style={{ flex: 1, height: '1px', background: `linear-gradient(to right, ${group.border}, transparent)` }} />
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', flexShrink: 0 }}>{group.members.length}명</span>
              </div>

              {group.value === '군단장' ? (
                <div>
                  {group.members.map((m) => <CommanderCard key={m.id} member={m} />)}
                </div>
              ) : (
                <div className="member-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
                  {group.members.map((m) => <MemberCard key={m.id} member={m} />)}
                </div>
              )}
            </section>
          ))
        )}
      </div>
    </div>
  )
}
