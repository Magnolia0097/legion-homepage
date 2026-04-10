'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getStoredToken, getAdminRole } from '@/lib/firebase'
import { inviteApi } from '@/lib/api'
import type { InviteToken, User } from '@/types'
import AdminHeader from '@/components/AdminHeader'

const BASE_URL = typeof window !== 'undefined' ? window.location.origin : 'https://nania-ssimdang.pages.dev'

const EXPIRY_OPTIONS = [
  { label: '24시간', value: 24 },
  { label: '3일', value: 72 },
  { label: '7일', value: 168 },
  { label: '30일', value: 720 },
]

const cardStyle: React.CSSProperties = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border-gold)',
  borderRadius: '10px',
  padding: '20px',
}

const primaryBtnStyle: React.CSSProperties = {
  background: 'var(--gold-mid)',
  color: 'var(--bg-base)',
  fontWeight: '700',
  padding: '8px 20px',
  borderRadius: '6px',
  border: 'none',
  cursor: 'pointer',
  fontSize: '13px',
  fontFamily: 'inherit',
  whiteSpace: 'nowrap' as const,
}

function chipStyle(active: boolean, color: 'gold' | 'neutral' = 'gold'): React.CSSProperties {
  if (color === 'gold') {
    return {
      fontSize: '12px',
      fontFamily: 'inherit',
      padding: '4px 14px',
      borderRadius: '99px',
      border: active ? '1.5px solid var(--gold-mid)' : '1px solid var(--border-dark)',
      background: active ? 'rgba(212,160,23,0.12)' : 'transparent',
      color: active ? 'var(--gold-mid)' : 'var(--text-muted)',
      cursor: 'pointer',
      fontWeight: active ? 700 : 400,
    }
  }
  return {
    fontSize: '12px',
    fontFamily: 'inherit',
    padding: '4px 14px',
    borderRadius: '99px',
    border: active ? '1.5px solid var(--text-sub)' : '1px solid var(--border-dark)',
    background: active ? 'rgba(180,160,120,0.1)' : 'transparent',
    color: active ? 'var(--text-sub)' : 'var(--text-muted)',
    cursor: 'pointer',
    fontWeight: active ? 700 : 400,
  }
}

function formatExpiry(expiresAt: string | null): string | null {
  if (!expiresAt) return null
  const d = new Date(expiresAt)
  return d.toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
}

function isExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false
  return new Date(expiresAt) < new Date()
}

export default function AdminInvitePage() {
  const router = useRouter()
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [tokens, setTokens] = useState<InviteToken[]>([])
  const [loginLogs, setLoginLogs] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState<'user' | 'admin' | null>(null)
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  // 생성 옵션 상태
  const [linkMode, setLinkMode] = useState<'single' | 'period'>('single')
  const [expiresIn, setExpiresIn] = useState<number>(72) // 기간제 기본값 3일

  useEffect(() => {
    if (!getStoredToken() || getAdminRole() !== 'super') {
      router.push('/admin/login')
      return
    }
    setIsSuperAdmin(true)
    loadData(true)
  }, [])

  async function loadData(superAdmin: boolean) {
    setLoading(true)
    try {
      const [tokenList, logs] = await Promise.all([
        inviteApi.list(),
        superAdmin ? inviteApi.loginLogs() : Promise.resolve([]),
      ])
      setTokens(tokenList)
      setLoginLogs(logs)
    } catch {
      setMessage({ text: '데이터를 불러오는 데 실패했습니다.', error: true })
    } finally {
      setLoading(false)
    }
  }

  async function handleCreate(type: 'user' | 'admin') {
    setCreating(type)
    setMessage(null)
    try {
      const result = await inviteApi.create(type, linkMode, linkMode === 'period' ? expiresIn : undefined)
      if (result.token) {
        setMessage({ text: '초대 링크가 생성되었습니다.' })
        await loadData(isSuperAdmin)
        setTimeout(() => setMessage(null), 3000)
      } else {
        setMessage({ text: '생성에 실패했습니다.', error: true })
      }
    } catch {
      setMessage({ text: '오류가 발생했습니다.', error: true })
    } finally {
      setCreating(null)
    }
  }

  async function handleDelete(token: string) {
    if (!confirm('이 초대 링크를 삭제하시겠습니까?')) return
    const res = await inviteApi.delete(token)
    if (res.ok) {
      setTokens((prev) => prev.filter((t) => t.token !== token))
    } else {
      const body = await res.json() as { error?: string }
      setMessage({ text: body.error ?? '삭제에 실패했습니다.', error: true })
      setTimeout(() => setMessage(null), 3000)
    }
  }

  function copyLink(token: string) {
    const url = `${BASE_URL}/join?token=${token}`
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(token)
      setTimeout(() => setCopied(null), 2000)
    }).catch(() => {
      prompt('링크를 복사하세요:', url)
    })
  }

  // 토큰 분류
  const activeTokens = tokens.filter((t) => {
    if (isExpired(t.expires_at)) return false
    if ((t.mode === 'single' || !t.mode) && t.used_by) return false
    return true
  })
  const usedTokens = tokens.filter((t) => (t.mode === 'single' || !t.mode) && t.used_by)
  const expiredTokens = tokens.filter((t) => !t.used_by && isExpired(t.expires_at))

  // 활성 토큰을 1회용 / 기간제로 분리
  const activeSingle = activeTokens.filter((t) => t.mode === 'single' || !t.mode)
  const activePeriod = activeTokens.filter((t) => t.mode === 'period')

  function TokenBadge({ t }: { t: InviteToken }) {
    const isPeriod = t.mode === 'period'
    const expiry = formatExpiry(t.expires_at)
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px', flexWrap: 'wrap' }}>
        {/* 멤버/관리자 */}
        <span style={{
          fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '99px',
          background: t.type === 'admin' ? 'rgba(212,160,23,0.15)' : 'rgba(100,180,100,0.12)',
          color: t.type === 'admin' ? 'var(--gold-mid)' : '#5da85d',
          border: t.type === 'admin' ? '1px solid var(--border-gold)' : '1px solid rgba(100,180,100,0.3)',
        }}>
          {t.type === 'admin' ? '관리자' : '멤버'}
        </span>
        {/* 1회용/기간제 */}
        {isPeriod ? (
          <span style={{
            fontSize: '11px', fontWeight: 700, padding: '2px 10px', borderRadius: '99px',
            background: 'rgba(212,160,23,0.1)',
            color: 'var(--gold-mid)',
            border: '1px solid rgba(212,160,23,0.4)',
          }}>
            기간제 · {expiry} 까지
          </span>
        ) : (
          <span style={{
            fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '99px',
            background: 'rgba(120,120,120,0.1)',
            color: 'var(--text-muted)',
            border: '1px solid var(--border-dark)',
          }}>
            1회용
          </span>
        )}
      </div>
    )
  }

  function ActiveTokenCard({ t }: { t: InviteToken }) {
    return (
      <div style={{
        ...cardStyle,
        border: '1px solid var(--border-dark)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        padding: '14px 16px',
      }}>
        <div style={{ minWidth: 0 }}>
          <TokenBadge t={t} />
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
            생성: {t.created_at.slice(0, 16).replace('T', ' ')}
            {isSuperAdmin && t.created_by && ` · ${t.created_by}`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
          <button
            onClick={() => copyLink(t.token)}
            style={{
              ...primaryBtnStyle,
              padding: '6px 14px',
              background: copied === t.token ? 'rgba(100,180,100,0.2)' : 'var(--gold-mid)',
              color: copied === t.token ? '#5da85d' : 'var(--bg-base)',
            }}
          >
            {copied === t.token ? '복사됨!' : '링크 복사'}
          </button>
          <button
            onClick={() => handleDelete(t.token)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontFamily: 'inherit', fontSize: '12px', padding: '6px 8px' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#e05050')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
          >
            삭제
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8 max-w-2xl mx-auto">
      <AdminHeader title="초대 링크 관리" subtitle="초대 링크 생성 및 관리" />

      {message && (
        <p className="text-sm px-1" style={{ color: message.error ? '#e05050' : 'var(--gold-mid)' }}>
          {message.text}
        </p>
      )}

      {/* 링크 생성 */}
      <div style={cardStyle}>
        <h2 className="text-base font-semibold mb-3" style={{ color: 'var(--text-main)' }}>
          초대 링크 생성
        </h2>

        {/* 링크 종류 선택 */}
        <div style={{ marginBottom: '16px' }}>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>링크 종류</p>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => setLinkMode('single')} style={chipStyle(linkMode === 'single', 'neutral')}>
              1회용
            </button>
            <button onClick={() => setLinkMode('period')} style={chipStyle(linkMode === 'period', 'neutral')}>
              기간제
            </button>
          </div>
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
            {linkMode === 'single'
              ? '1명이 가입하면 소모되는 링크입니다.'
              : '유효 기간 동안 누구나 계속 가입할 수 있는 링크입니다.'}
          </p>
        </div>

        {/* 기간제: 유효 기간 선택 */}
        {linkMode === 'period' && (
          <div style={{ marginBottom: '16px' }}>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>유효 기간</p>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {EXPIRY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setExpiresIn(opt.value)}
                  style={chipStyle(expiresIn === opt.value, 'gold')}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-3 flex-wrap">
          <button
            onClick={() => handleCreate('user')}
            disabled={creating !== null}
            style={{ ...primaryBtnStyle, opacity: creating !== null ? 0.5 : 1 }}
          >
            {creating === 'user' ? '생성 중...' : '멤버 초대 링크 생성'}
          </button>
          {isSuperAdmin && (
            <button
              onClick={() => handleCreate('admin')}
              disabled={creating !== null}
              style={{
                ...primaryBtnStyle,
                background: 'transparent',
                border: '1.5px solid var(--gold-mid)',
                color: 'var(--gold-mid)',
                opacity: creating !== null ? 0.5 : 1,
              }}
            >
              {creating === 'admin' ? '생성 중...' : '관리자 초대 링크 생성'}
            </button>
          )}
        </div>
      </div>

      {/* 1회용 미사용 링크 */}
      <div className="space-y-3">
        <h2 className="text-base font-semibold" style={{ color: 'var(--text-main)' }}>
          1회용 링크 ({loading ? '...' : activeSingle.length}개)
        </h2>
        {loading ? (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>불러오는 중...</p>
        ) : activeSingle.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>미사용 1회용 링크가 없습니다.</p>
        ) : (
          activeSingle.map((t) => <ActiveTokenCard key={t.token} t={t} />)
        )}
      </div>

      {/* 기간제 활성 링크 */}
      <div className="space-y-3">
        <h2 className="text-base font-semibold" style={{ color: 'var(--text-main)' }}>
          기간제 링크 ({loading ? '...' : activePeriod.length}개)
        </h2>
        {loading ? (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>불러오는 중...</p>
        ) : activePeriod.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>활성화된 기간제 링크가 없습니다.</p>
        ) : (
          activePeriod.map((t) => <ActiveTokenCard key={t.token} t={t} />)
        )}
      </div>

      {/* 만료된 기간제 링크 */}
      {!loading && expiredTokens.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-main)' }}>
            만료된 링크 ({expiredTokens.length}개)
          </h2>
          {expiredTokens.map((t) => (
            <div key={t.token} style={{
              ...cardStyle,
              border: '1px solid var(--border-dark)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              padding: '14px 16px',
              opacity: 0.65,
            }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px', flexWrap: 'wrap' }}>
                  <span style={{
                    fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '99px',
                    background: t.type === 'admin' ? 'rgba(212,160,23,0.15)' : 'rgba(100,180,100,0.12)',
                    color: t.type === 'admin' ? 'var(--gold-mid)' : '#5da85d',
                    border: t.type === 'admin' ? '1px solid var(--border-gold)' : '1px solid rgba(100,180,100,0.3)',
                  }}>
                    {t.type === 'admin' ? '관리자' : '멤버'}
                  </span>
                  <span style={{
                    fontSize: '11px', fontWeight: 700, padding: '2px 10px', borderRadius: '99px',
                    background: 'rgba(180,60,60,0.12)', color: '#e05050', border: '1px solid rgba(180,60,60,0.3)',
                  }}>
                    {t.mode === 'period' ? '기간제' : '1회용'} · 만료됨
                    {t.expires_at ? ` · ${formatExpiry(t.expires_at)}` : ''}
                  </span>
                </div>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
                  생성: {t.created_at.slice(0, 16).replace('T', ' ')}
                  {isSuperAdmin && t.created_by && ` · ${t.created_by}`}
                </p>
              </div>
              <button
                onClick={() => handleDelete(t.token)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontFamily: 'inherit', fontSize: '12px', padding: '6px 8px', flexShrink: 0 }}
                onMouseEnter={e => (e.currentTarget.style.color = '#e05050')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
              >
                삭제
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 사용 완료 링크 (1회용만) */}
      {usedTokens.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-main)' }}>
            사용 완료 링크 ({usedTokens.length}개)
          </h2>
          {usedTokens.map((t) => (
            <div key={t.token} style={{
              ...cardStyle,
              border: '1px solid var(--border-dark)',
              opacity: 0.55,
              padding: '10px 16px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                <span style={{
                  fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '99px',
                  background: t.type === 'admin' ? 'rgba(212,160,23,0.15)' : 'rgba(100,180,100,0.12)',
                  color: t.type === 'admin' ? 'var(--gold-mid)' : '#5da85d',
                  border: t.type === 'admin' ? '1px solid var(--border-gold)' : '1px solid rgba(100,180,100,0.3)',
                }}>
                  {t.type === 'admin' ? '관리자' : '멤버'}
                </span>
                <span style={{
                  fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '99px',
                  background: 'rgba(120,120,120,0.1)', color: 'var(--text-muted)', border: '1px solid var(--border-dark)',
                }}>
                  1회용 · 사용됨
                </span>
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
                사용: {t.used_by}
                {t.used_at && ` · ${t.used_at.slice(0, 16).replace('T', ' ')}`}
                {isSuperAdmin && t.created_by && ` · 생성자: ${t.created_by}`}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* 최초 로그인 기록 (최고관리자 전용) */}
      {isSuperAdmin && (
        <div className="space-y-3">
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-main)' }}>
            최초 가입 기록
          </h2>
          {loginLogs.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              초대 링크를 통해 가입한 멤버가 없습니다.
            </p>
          ) : (
            <div style={{ ...cardStyle, padding: '0', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-dark)' }}>
                    {['닉네임', '이메일', '가입일시', '초대자'].map((h) => (
                      <th key={h} style={{
                        textAlign: 'left', padding: '10px 14px', color: 'var(--text-muted)',
                        fontWeight: 600, fontSize: '12px', whiteSpace: 'nowrap',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loginLogs.map((u) => (
                    <tr key={u.id} style={{ borderBottom: '1px solid var(--border-dark)' }}>
                      <td style={{ padding: '10px 14px', color: 'var(--text-main)', fontWeight: 600 }}>{u.nickname}</td>
                      <td style={{ padding: '10px 14px', color: 'var(--text-sub)', fontSize: '12px' }}>{u.email}</td>
                      <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: '12px', whiteSpace: 'nowrap' }}>
                        {u.first_login_at?.slice(0, 16).replace('T', ' ') ?? '-'}
                      </td>
                      <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: '12px' }}>{u.added_by}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
