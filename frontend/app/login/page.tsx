'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { loginWithGoogle, setAdminRole, setAdminPermissions, setAdminNickname, setUserInfo, logout, isInAppBrowser } from '@/lib/firebase'
import { authApi } from '@/lib/api'

export default function LoginPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [inApp, setInApp] = useState(false)

  useEffect(() => {
    setInApp(isInAppBrowser())
  }, [])

  async function handleLogin() {
    setLoading(true)
    setError(null)
    try {
      await loginWithGoogle()
      const result = await authApi.verify()

      if (!result.valid) {
        await logout()
        setError('인증에 실패했습니다.')
        return
      }

      // 관리자인 경우 관리자 페이지로
      if (result.isAdmin) {
        setAdminRole(result.isSuperAdmin)
        setAdminPermissions(result.permissions ?? [])
        setAdminNickname(result.nickname ?? '')
        router.push('/admin/notice')
        return
      }

      // 일반 사용자인 경우
      if (result.isUser) {
        setUserInfo(result.userNickname)
        router.push('/')
        return
      }

      // 등록되지 않은 계정
      await logout()
      setError('등록되지 않은 계정입니다. 관리자에게 문의해주세요.')
    } catch (e) {
      setError('로그인에 실패했습니다.')
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-sm mx-auto mt-20 space-y-6 text-center">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-main)' }}>로그인</h1>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          나니아 성심당 레기온 멤버 전용 로그인입니다.
        </p>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          관리자에 의해 등록된 구글 계정으로만 로그인이 가능합니다.
        </p>
      </div>

      {inApp ? (
        /* 인앱 브라우저 (카카오톡, 네이버 앱 등) 안내 */
        <div
          className="w-full rounded-lg p-4 space-y-3 text-sm"
          style={{ background: 'rgba(212,160,23,0.08)', border: '1px solid var(--border-gold)' }}
        >
          <p style={{ color: 'var(--text-main)', fontWeight: 600 }}>
            ⚠️ 외부 브라우저에서 접속해 주세요
          </p>
          <p style={{ color: 'var(--text-muted)', lineHeight: 1.6 }}>
            카카오톡·네이버 앱 내 브라우저에서는<br />
            Google 로그인이 지원되지 않습니다.<br />
            크롬(Chrome) 또는 기본 브라우저로 열어주세요.
          </p>
          <button
            onClick={() => window.open(window.location.href, '_blank')}
            className="w-full font-semibold px-4 py-2 rounded-lg transition-colors"
            style={{
              background: 'var(--border-gold)',
              color: '#1a1200',
              cursor: 'pointer',
            }}
          >
            외부 브라우저로 열기
          </button>
        </div>
      ) : (
        <button
          onClick={handleLogin}
          disabled={loading}
          className="w-full font-semibold px-6 py-3 rounded-lg disabled:opacity-50 transition-colors flex items-center justify-center gap-3"
          style={{
            background: 'var(--bg-card)',
            color: 'var(--text-main)',
            border: '1px solid var(--border-gold)',
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
          onMouseEnter={e => {
            if (!loading) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(212,160,23,0.1)'
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-card)'
          }}
        >
          {loading ? (
            <span style={{ color: 'var(--text-muted)' }}>로그인 중...</span>
          ) : (
            <>
              <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Google로 로그인
            </>
          )}
        </button>
      )}

      {error && <p className="text-sm" style={{ color: '#e05050' }}>{error}</p>}
    </div>
  )
}
