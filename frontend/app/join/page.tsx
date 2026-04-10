'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { loginWithGoogle, isInAppBrowser, setUserInfo, setAdminRole, setAdminPermissions, setAdminNickname, initAuthListener } from '@/lib/firebase'
import { inviteApi, authApi } from '@/lib/api'

const cardStyle: React.CSSProperties = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border-gold)',
  borderRadius: '12px',
  padding: '32px 28px',
  maxWidth: '420px',
  width: '100%',
  margin: '0 auto',
}

const inputStyle: React.CSSProperties = {
  background: 'var(--bg-base)',
  color: 'var(--text-main)',
  border: '1px solid var(--border-gold)',
  borderRadius: '6px',
  padding: '10px 14px',
  fontSize: '15px',
  width: '100%',
  fontFamily: 'inherit',
}

const primaryBtnStyle: React.CSSProperties = {
  background: 'var(--gold-mid)',
  color: 'var(--bg-base)',
  fontWeight: '700',
  padding: '12px 24px',
  borderRadius: '8px',
  border: 'none',
  cursor: 'pointer',
  fontSize: '15px',
  fontFamily: 'inherit',
  width: '100%',
}

function JoinContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const token = searchParams.get('token') ?? ''

  type TokenState = { valid: boolean; type?: 'user' | 'admin'; error?: string } | null
  const [tokenInfo, setTokenInfo] = useState<TokenState>(null)
  const [loading, setLoading] = useState(true)
  const [nickname, setNickname] = useState('')
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [inApp, setInApp] = useState(false)

  useEffect(() => {
    setInApp(isInAppBrowser())
    if (!token) {
      setLoading(false)
      return
    }
    inviteApi.getInfo(token).then((info) => {
      setTokenInfo(info)
      setLoading(false)
    }).catch(() => {
      setTokenInfo({ valid: false, error: '링크 정보를 불러오는 데 실패했습니다.' })
      setLoading(false)
    })
  }, [token])

  async function handleJoin() {
    if (!nickname.trim()) {
      setError('닉네임을 입력해주세요.')
      return
    }
    setJoining(true)
    setError(null)
    try {
      await loginWithGoogle()
      initAuthListener()
      const result = await inviteApi.use(token, nickname.trim())
      if (result.error) {
        setError(result.error)
        setJoining(false)
        return
      }
      // 가입 성공 후 인증 상태 업데이트
      const verify = await authApi.verify()
      if (verify.valid) {
        if (verify.isAdmin || verify.isSuperAdmin) {
          setAdminRole(verify.isSuperAdmin)
          setAdminPermissions(verify.permissions)
          setAdminNickname(verify.nickname)
        } else if (verify.isUser) {
          setUserInfo(verify.userNickname)
        }
      }
      router.push('/')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : ''
      if (msg.includes('popup-closed') || msg.includes('cancelled')) {
        setError('로그인이 취소되었습니다. 다시 시도해주세요.')
      } else {
        setError('오류가 발생했습니다. 다시 시도해주세요.')
      }
      setJoining(false)
    }
  }

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--text-muted)' }}>
        링크 확인 중...
      </div>
    )
  }

  if (!token) {
    return (
      <div style={cardStyle}>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px', textAlign: 'center' }}>
          유효하지 않은 접근입니다. 초대 링크를 통해 접속해주세요.
        </p>
      </div>
    )
  }

  if (!tokenInfo?.valid) {
    return (
      <div style={cardStyle}>
        <h2 style={{ color: 'var(--gold-light)', fontWeight: 700, fontSize: '18px', marginBottom: '12px' }}>
          초대 링크 오류
        </h2>
        <p style={{ color: 'var(--text-sub)', fontSize: '14px' }}>
          {tokenInfo?.error ?? '유효하지 않은 초대 링크입니다.'}
        </p>
      </div>
    )
  }

  return (
    <div style={cardStyle}>
      <div style={{ textAlign: 'center', marginBottom: '24px' }}>
        <div style={{ fontSize: '32px', marginBottom: '8px' }}>
          {tokenInfo.type === 'admin' ? '🗡️' : '⚔️'}
        </div>
        <h1 style={{ color: 'var(--gold-light)', fontWeight: 700, fontSize: '20px', margin: 0 }}>
          나니아 성심당 가입
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '6px' }}>
          {tokenInfo.type === 'admin' ? '관리자 초대 링크' : '멤버 초대 링크'}
        </p>
      </div>

      {inApp ? (
        <div style={{
          background: 'rgba(224,80,80,0.08)',
          border: '1px solid rgba(224,80,80,0.3)',
          borderRadius: '8px',
          padding: '14px 16px',
          color: '#e05050',
          fontSize: '13px',
          lineHeight: '1.6',
        }}>
          <strong>카카오톡·인앱 브라우저에서는 Google 로그인이 불가합니다.</strong><br />
          링크를 복사해 Safari 또는 Chrome 브라우저에서 열어주세요.
          <br /><br />
          <button
            onClick={() => {
              navigator.clipboard?.writeText(window.location.href)
                .then(() => alert('링크가 복사되었습니다.'))
                .catch(() => alert('주소창에서 링크를 직접 복사해주세요.'))
            }}
            style={{
              background: 'rgba(224,80,80,0.15)',
              border: '1px solid rgba(224,80,80,0.4)',
              borderRadius: '6px',
              color: '#e05050',
              padding: '6px 14px',
              fontSize: '13px',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            링크 복사
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-sub)', marginBottom: '6px', fontWeight: 600 }}>
              닉네임
            </label>
            <input
              type="text"
              placeholder="사용할 닉네임을 입력하세요"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              maxLength={30}
              disabled={joining}
              style={{ ...inputStyle, opacity: joining ? 0.6 : 1 }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleJoin() }}
            />
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
              게시글·댓글에 표시될 이름입니다.
            </p>
          </div>

          {error && (
            <p style={{ color: '#e05050', fontSize: '13px', margin: 0 }}>{error}</p>
          )}

          <button
            onClick={handleJoin}
            disabled={joining || !nickname.trim()}
            style={{
              ...primaryBtnStyle,
              opacity: (joining || !nickname.trim()) ? 0.5 : 1,
              cursor: (joining || !nickname.trim()) ? 'not-allowed' : 'pointer',
            }}
          >
            {joining ? '가입 처리 중...' : 'Google 계정으로 가입'}
          </button>

          <p style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', margin: 0 }}>
            Google 로그인 후 자동으로 가입이 완료됩니다.
            <br />이미 계정이 있다면 로그인 후 기존 계정으로 처리됩니다.
          </p>
        </div>
      )}
    </div>
  )
}

export default function JoinPage() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', padding: '24px 0' }}>
      <Suspense fallback={
        <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>불러오는 중...</div>
      }>
        <JoinContent />
      </Suspense>
    </div>
  )
}
