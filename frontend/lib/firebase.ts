import { initializeApp, getApps } from 'firebase/app'
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
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
}

export function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('firebase_token')
}

// 앱 시작 시 호출: 토큰 자동 갱신 등록
export function initAuthListener(): void {
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      const freshToken = await user.getIdToken(true)
      localStorage.setItem('firebase_token', freshToken)
    } else {
      localStorage.removeItem('firebase_token')
    }
  })
}
