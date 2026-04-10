'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getAdminRole } from '@/lib/firebase'

type ThemeKey = 'current' | 'a' | 'b'
type ModeKey = 'dark' | 'light'

const THEMES: Record<ThemeKey, { label: string; subLabel: string; accent: string }> = {
  current: { label: '현재', subLabel: '배포 중인 디자인', accent: '#d4a017' },
  a: { label: 'A안', subLabel: 'Luxury', accent: '#e8c870' },
  b: { label: 'B안', subLabel: 'Refined Polish', accent: '#d4a017' },
}

// ── 샘플 데이터 ──
const SAMPLE_MEMBERS = [
  { role: '군단장', icon: '👑', color: 'var(--gold-light)', names: ['Chan'] },
  { role: '엘리트장교', icon: '🗡️', color: '#e0a0a0', names: ['성심당힐빵', '종으리', '질투마스크', '캔디'] },
  { role: '명예장교', icon: '🎖️', color: '#c8a8e8', names: ['이린', '주장', '지니', '클레어'] },
]

const SAMPLE_NOTICES = [
  { title: '2026년 3월 군단 정기 공지사항', date: '2026.03.15', pinned: true, author: '나니아', preview: '안녕하세요 성심당입니다. 이번 달 일정과 주요 사항을 안내드립니다.' },
  { title: '주간 레이드 일정 및 보상 안내', date: '2026.03.12', pinned: false, author: '나니아', preview: '이번 주 레이드 일정을 안내드립니다. 참여 가능한 분들은 미리 확인해주세요.' },
  { title: '신규 멤버 환영 및 가입 안내', date: '2026.03.10', pinned: false, author: '나니아', preview: '새로운 멤버를 환영합니다! 가입 절차와 주의사항을 확인해주세요.' },
]

// ── 섹션 타이틀 ──
function SectionLabel({ text }: { text: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
      <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, transparent, var(--border-gold))' }} />
      <span style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.3em', color: 'var(--gold-mid)', textTransform: 'uppercase' }}>{text}</span>
      <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, var(--border-gold), transparent)' }} />
    </div>
  )
}

// ── 카드 ──
function PreviewCard({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border-gold)',
      borderRadius: 'var(--card-radius, 8px)',
      boxShadow: 'var(--card-shadow, none)',
      padding: '14px 16px',
      ...style,
    }}>
      {children}
    </div>
  )
}

// ── 버튼 ──
function PreviewBtn({ children, primary }: { children: React.ReactNode; primary?: boolean }) {
  return (
    <button style={{
      padding: primary ? '10px 24px' : '8px 18px',
      borderRadius: 999,
      border: `1.5px solid ${primary ? 'var(--gold-mid)' : 'var(--border-gold)'}`,
      background: primary ? 'var(--btn-bg, transparent)' : 'transparent',
      color: primary ? 'var(--gold-light)' : 'var(--text-sub)',
      fontSize: primary ? '0.875rem' : '0.8rem',
      fontWeight: primary ? 700 : 500,
      letterSpacing: '0.06em',
      cursor: 'pointer',
    }}>
      {children}
    </button>
  )
}

// ── 테마 프리뷰 패널 ──
function ThemePanel({ themeKey, mode }: { themeKey: ThemeKey; mode: ModeKey }) {
  const desc: Record<ThemeKey, Record<ModeKey, React.ReactNode>> = {
    current: {
      dark: <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>현재 배포 중인 다크 디자인입니다</span>,
      light: <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>현재 배포 중인 라이트 디자인입니다</span>,
    },
    a: {
      dark: (
        <ul style={{ color: 'var(--text-muted)', fontSize: '0.75rem', lineHeight: 1.8, paddingLeft: 16, margin: 0 }}>
          <li>배경 더 깊은 블랙 (#0d0a06)</li>
          <li>샴페인 골드 (#e8c870) — 더 따뜻하고 밝음</li>
          <li>카드 골드 글로우 쉐도우</li>
          <li>border-radius 14px — 더 둥글게</li>
          <li>버튼 그라데이션 fill</li>
        </ul>
      ),
      light: (
        <ul style={{ color: 'var(--text-muted)', fontSize: '0.75rem', lineHeight: 1.8, paddingLeft: 16, margin: 0 }}>
          <li>배경 아이보리 크림 (#faf5e8)</li>
          <li>딥 골드 (#7a5200) — 고급 인쇄물 느낌</li>
          <li>카드 골드 글로우 쉐도우 (라이트 버전)</li>
          <li>border-radius 14px</li>
          <li>버튼 subtle 그라데이션</li>
        </ul>
      ),
    },
    b: {
      dark: (
        <ul style={{ color: 'var(--text-muted)', fontSize: '0.75rem', lineHeight: 1.8, paddingLeft: 16, margin: 0 }}>
          <li>현재 골드 팔레트 유지</li>
          <li>카드 미묘한 elevation 쉐도우</li>
          <li>버튼 subtle 그라데이션</li>
          <li>border-radius 10px</li>
          <li>전체적인 완성도 향상</li>
        </ul>
      ),
      light: (
        <ul style={{ color: 'var(--text-muted)', fontSize: '0.75rem', lineHeight: 1.8, paddingLeft: 16, margin: 0 }}>
          <li>현재 라이트 팔레트 유지</li>
          <li>카드 elevation 쉐도우 강화</li>
          <li>버튼 subtle 그라데이션</li>
          <li>border-radius 10px</li>
          <li>전체적인 완성도 향상</li>
        </ul>
      ),
    },
  }

  return (
    <div
      data-preview-theme={themeKey}
      data-preview-mode={mode}
      style={{
        background: 'var(--bg-base)',
        color: 'var(--text-main)',
        fontFamily: "'Pretendard', -apple-system, sans-serif",
        borderRadius: 16,
        overflow: 'hidden',
        border: '1px solid var(--border-gold)',
        minWidth: 0,
      }}
    >
      {/* 패널 헤더 */}
      <div style={{
        background: 'var(--bg-header)',
        borderBottom: '1px solid var(--border-gold)',
        padding: '12px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
      }}>
        <div>
          <div style={{ fontSize: '0.7rem', letterSpacing: '0.25em', color: 'var(--gold-mid)', fontWeight: 700 }}>{THEMES[themeKey].label}</div>
          <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', letterSpacing: '0.1em' }}>{THEMES[themeKey].subLabel}</div>
        </div>
        {/* 미니 네비 */}
        <div style={{ display: 'flex', gap: 12 }}>
          {['공지사항', '이벤트', '갤러리'].map(n => (
            <span key={n} style={{ fontSize: '0.68rem', color: 'var(--text-sub)', letterSpacing: '0.05em' }}>{n}</span>
          ))}
        </div>
      </div>

      <div style={{ padding: '20px 20px 28px' }}>

        {/* 변경 사항 */}
        <div style={{ marginBottom: 28 }}>
          {desc[themeKey][mode]}
        </div>

        {/* 색상 팔레트 */}
        <div style={{ marginBottom: 28 }}>
          <SectionLabel text="Color Palette" />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[
              { name: 'bg-base', val: 'var(--bg-base)' },
              { name: 'bg-card', val: 'var(--bg-card)' },
              { name: 'gold-light', val: 'var(--gold-light)' },
              { name: 'gold-mid', val: 'var(--gold-mid)' },
              { name: 'gold-dark', val: 'var(--gold-dark)' },
              { name: 'text-main', val: 'var(--text-main)' },
              { name: 'text-sub', val: 'var(--text-sub)' },
              { name: 'text-muted', val: 'var(--text-muted)' },
            ].map(c => (
              <div key={c.name} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 8,
                  background: c.val,
                  border: '1px solid var(--border-gold)',
                }} />
                <span style={{ fontSize: '0.52rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{c.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 타이포그래피 */}
        <div style={{ marginBottom: 28 }}>
          <SectionLabel text="Typography" />
          <div style={{
            background: 'var(--bg-header)',
            borderRadius: 'var(--card-radius, 8px)',
            border: '1px solid var(--border-dark)',
            padding: '16px 20px',
          }}>
            <div style={{ fontSize: '0.52rem', letterSpacing: '0.35em', color: 'var(--gold-dark)', marginBottom: 4 }}>✦ ─────── ✦</div>
            <div style={{ fontSize: '0.62rem', letterSpacing: '0.4em', color: 'var(--gold-mid)', marginBottom: 2 }}>성심당</div>
            <div style={{ fontSize: '0.52rem', letterSpacing: '0.3em', color: 'var(--text-muted)', marginBottom: 12 }}>A · I · O · N · 2</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '0.04em', lineHeight: 1.2, marginBottom: 6 }}>나니아 성심당</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-sub)', letterSpacing: '0.08em', marginBottom: 16 }}>친목 · 라이트유저 · 매너 플레이</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
              벚꽃이 흩날리는 밤, 레기온이 선정한 3월의 모델을 만나보세요.
            </div>
          </div>
        </div>

        {/* 버튼 */}
        <div style={{ marginBottom: 28 }}>
          <SectionLabel text="Buttons & Badges" />
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <PreviewBtn primary>갤러리 보기</PreviewBtn>
            <PreviewBtn>← 목록으로</PreviewBtn>
            <span style={{
              fontSize: '0.6rem', letterSpacing: '0.2em', fontWeight: 700,
              color: '#ffcce0', padding: '4px 12px', borderRadius: 999,
              background: 'rgba(255,192,203,0.18)',
              border: '1px solid rgba(255,192,203,0.6)',
            }}>✦ 이달의 모델</span>
            <span style={{
              fontSize: '0.6rem', letterSpacing: '0.15em', fontWeight: 700,
              color: 'var(--bg-base)', padding: '3px 10px', borderRadius: 999,
              background: 'var(--gold-mid)',
            }}>📌 고정</span>
          </div>
        </div>

        {/* 공지 카드 */}
        <div style={{ marginBottom: 28 }}>
          <SectionLabel text="Notice Cards" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {SAMPLE_NOTICES.map((n, i) => (
              <PreviewCard key={i}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {n.pinned && (
                      <span style={{
                        fontSize: '0.58rem', fontWeight: 700, padding: '2px 8px',
                        borderRadius: 999, background: 'var(--gold-mid)',
                        color: 'var(--bg-base)', letterSpacing: '0.1em',
                      }}>📌 고정</span>
                    )}
                    <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)' }}>{n.title}</span>
                  </div>
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{n.date}</span>
                </div>
                <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>{n.preview}</p>
                <div style={{ marginTop: 6, fontSize: '0.65rem', color: 'var(--text-sub)' }}>by {n.author}</div>
              </PreviewCard>
            ))}
          </div>
        </div>

        {/* 멤버 카드 */}
        <div style={{ marginBottom: 28 }}>
          <SectionLabel text="Member List" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {SAMPLE_MEMBERS.map((m) => (
              <PreviewCard key={m.role}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: '1.2rem' }}>{m.icon}</span>
                  <div>
                    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: m.color, letterSpacing: '0.08em', marginBottom: 3 }}>{m.role}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-main)', letterSpacing: '0.04em' }}>
                      {m.names.join(' · ')}
                    </div>
                  </div>
                </div>
              </PreviewCard>
            ))}
          </div>
        </div>

        {/* 갤러리 그리드 */}
        <div>
          <SectionLabel text="Gallery Grid" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gridAutoRows: 80, gap: 8 }}>
            {/* 이달의 모델 (2x2 span) */}
            <div style={{
              gridColumn: 'span 2', gridRow: 'span 2',
              background: 'linear-gradient(135deg, var(--bg-card) 0%, rgba(232,200,112,0.08) 100%)',
              border: '1px solid var(--border-gold)',
              borderRadius: 'var(--card-radius, 8px)',
              boxShadow: 'var(--card-shadow, none)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end',
              padding: 10, position: 'relative', overflow: 'hidden',
            }}>
              <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                background: 'linear-gradient(135deg, rgba(232,180,80,0.1) 0%, transparent 60%)',
              }} />
              <div style={{
                fontSize: '0.58rem', letterSpacing: '0.2em', fontWeight: 700,
                color: '#ffcce0', padding: '3px 10px', borderRadius: 999,
                background: 'rgba(255,192,203,0.18)',
                border: '1px solid rgba(255,192,203,0.5)',
                position: 'relative',
              }}>✦ 이달의 모델</div>
            </div>
            {/* 일반 사진 셀 */}
            {[...Array(4)].map((_, i) => (
              <div key={i} style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border-dark)',
                borderRadius: 'var(--card-radius, 8px)',
                boxShadow: 'var(--card-shadow, none)',
              }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── 메인 페이지 ──
export default function DesignPreviewPage() {
  const router = useRouter()
  const [authorized, setAuthorized] = useState<boolean | null>(null)
  const [active, setActive] = useState<ThemeKey>('current')
  const [mode, setMode] = useState<ModeKey>('dark')

  useEffect(() => {
    const role = getAdminRole()
    if (role !== 'super') {
      router.replace('/')
    } else {
      setAuthorized(true)
    }
  }, [router])

  if (authorized === null) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', letterSpacing: '0.1em' }}>확인 중...</div>
      </div>
    )
  }

  return (
    <div style={{ padding: '24px 0 80px' }}>
      {/* 페이지 타이틀 */}
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div style={{ fontSize: '0.6rem', letterSpacing: '0.35em', color: 'var(--gold-dark)', marginBottom: 6 }}>✦ ─────── ✦</div>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '0.06em', margin: '0 0 6px' }}>
          디자인 시안
        </h1>
        <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: 0, letterSpacing: '0.08em' }}>
          최고관리자 전용 · Design Preview
        </p>
      </div>

      {/* 탭 선택 + 다크/라이트 토글 — sticky */}
      <div style={{
        position: 'sticky', top: 56, zIndex: 50,
        background: 'var(--bg-header)',
        borderTop: '1px solid var(--border-gold)',
        borderBottom: '1px solid var(--border-gold)',
        marginBottom: 32,
      }}>
        {/* 상단: 다크/라이트 토글 */}
        <div style={{
          display: 'flex', justifyContent: 'center', gap: 4,
          padding: '8px 16px 6px',
          borderBottom: '1px solid var(--border-dark)',
        }}>
          {(['dark', 'light'] as ModeKey[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={{
                padding: '4px 16px', borderRadius: 999,
                border: `1px solid ${mode === m ? 'var(--gold-mid)' : 'var(--border-dark)'}`,
                background: mode === m ? 'rgba(212,160,23,0.12)' : 'transparent',
                color: mode === m ? 'var(--gold-light)' : 'var(--text-muted)',
                fontSize: '0.7rem', fontWeight: mode === m ? 700 : 400,
                letterSpacing: '0.1em', cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {m === 'dark' ? '🌙 다크' : '☀️ 라이트'}
            </button>
          ))}
        </div>
        {/* 하단: 테마 탭 */}
        <div style={{ display: 'flex' }}>
          {(Object.keys(THEMES) as ThemeKey[]).map((key) => (
            <button
              key={key}
              onClick={() => setActive(key)}
              style={{
                flex: 1, padding: '11px 8px',
                background: active === key ? 'rgba(212,160,23,0.1)' : 'transparent',
                border: 'none',
                borderBottom: active === key ? `2px solid var(--gold-mid)` : '2px solid transparent',
                color: active === key ? 'var(--gold-light)' : 'var(--text-muted)',
                fontSize: '0.8rem', fontWeight: active === key ? 700 : 400,
                letterSpacing: '0.06em', cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              <div>{THEMES[key].label}</div>
              <div style={{ fontSize: '0.58rem', letterSpacing: '0.08em', marginTop: 1, opacity: 0.8 }}>
                {THEMES[key].subLabel} {mode === 'light' && key !== 'current' ? 'Light' : mode === 'dark' && key !== 'current' ? 'Dark' : ''}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* 선택된 테마 프리뷰 */}
      <div style={{ padding: '0 4px' }}>
        <ThemePanel themeKey={active} mode={mode} />
      </div>

      {/* 하단 안내 */}
      <div style={{
        marginTop: 40, textAlign: 'center',
        fontSize: '0.68rem', color: 'var(--text-muted)',
        lineHeight: 1.8,
      }}>
        <div>원하는 시안을 선택하면 바로 적용해드립니다.</div>
        <div style={{ marginTop: 4 }}>갤러리 이달의 모델 letterbox 수정도 함께 적용 가능합니다.</div>
      </div>
    </div>
  )
}
