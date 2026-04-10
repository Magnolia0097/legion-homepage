import { initializeApp, getApps } from 'firebase/app'
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onIdTokenChanged,
  type User,
} from 'firebase/auth'

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
}

// 중복 초기화 방지
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0]!
export const auth = getAuth(app)
export const googleProvider = new GoogleAuthProvider()

export async function loginWithGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider)
  const token = await result.user.getIdToken()
  localStorage.setItem('firebase_token', token)
  return result.user
}

export async function logout(): Promise<void> {
  await signOut(auth)
  localStorage.removeItem('firebase_token')
  localStorage.removeItem('admin_role')
  localStorage.removeItem('admin_permissions')
  localStorage.removeItem('admin_nickname')
  localStorage.removeItem('user_role')
  localStorage.removeItem('user_nickname')
}

export function setAdminRole(isSuperAdmin: boolean): void {
  if (typeof window === 'undefined') return
  localStorage.setItem('admin_role', isSuperAdmin ? 'super' : 'admin')
}

export function getAdminRole(): 'super' | 'admin' | null {
  if (typeof window === 'undefined') return null
  const role = localStorage.getItem('admin_role')
  if (role === 'super' || role === 'admin') return role
  return null
}

export function setAdminPermissions(permissions: string[]): void {
  if (typeof window === 'undefined') return
  localStorage.setItem('admin_permissions', JSON.stringify(permissions))
}

export function getAdminPermissions(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem('admin_permissions')
    if (!raw) return []
    return JSON.parse(raw) as string[]
  } catch { return [] }
}

export function hasPermission(permission: string): boolean {
  return getAdminPermissions().includes(permission)
}

export function setAdminNickname(nickname: string): void {
  if (typeof window === 'undefined') return
  localStorage.setItem('admin_nickname', nickname)
}

export function getAdminNickname(): string {
  if (typeof window === 'undefined') return ''
  return localStorage.getItem('admin_nickname') ?? ''
}

export function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('firebase_token')
}

// 앱 시작 시 호출: Firebase가 토큰을 자동 갱신할 때마다(~1시간) localStorage도 갱신
export function initAuthListener(): void {
  onIdTokenChanged(auth, async (user) => {
    if (user) {
      const freshToken = await user.getIdToken()
      localStorage.setItem('firebase_token', freshToken)
    } else {
      localStorage.removeItem('firebase_token')
    }
  })
}

// ─── 일반 사용자 정보 (localStorage) ───

export function setUserInfo(nickname: string): void {
  if (typeof window === 'undefined') return
  localStorage.setItem('user_role', 'user')
  localStorage.setItem('user_nickname', nickname)
}

export function getUserRole(): 'user' | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('user_role') === 'user' ? 'user' : null
}

export function getUserNickname(): string {
  if (typeof window === 'undefined') return ''
  return localStorage.getItem('user_nickname') ?? ''
}

// 인앱 브라우저 감지 (카카오톡, 네이버, Facebook 등 WebView)
// Google OAuth는 WebView에서 공식 차단됨 (disallowed_useragent)
export function isInAppBrowser(): boolean {
  if (typeof window === 'undefined') return false
  const ua = navigator.userAgent
  return (
    /KAKAOTALK/i.test(ua) ||
    /NAVER/i.test(ua) ||
    /Instagram/i.test(ua) ||
    /FBAN|FBAV/i.test(ua) ||
    /Line\//i.test(ua) ||
    /wv\)/.test(ua) || // Android WebView
    (/iPhone|iPod|iPad/.test(ua) && !/Safari/.test(ua)) // iOS WebView
  )
}

// 로그인 여부 (관리자 or 일반 사용자)
export function isLoggedIn(): boolean {
  if (typeof window === 'undefined') return false
  return !!(localStorage.getItem('admin_role') || localStorage.getItem('user_role'))
}

// 현재 로그인한 사용자의 표시 닉네임
export function getDisplayNickname(): string {
  if (typeof window === 'undefined') return ''
  return localStorage.getItem('admin_nickname') || localStorage.getItem('user_nickname') || ''
}
