import type { Metadata } from 'next'
import '@fontsource/pretendard/400.css'
import '@fontsource/pretendard/700.css'
import './globals.css'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { ThemeProvider } from '@/components/ThemeProvider'

const BASE_URL = 'https://legion-homepage.pages.dev'

export const metadata: Metadata = {
  title: {
    default: '나니아 성심당',
    template: '%s | 나니아 성심당',
  },
  description: '아이온2 레기온 나니아 성심당 공식 홈페이지. 친목, 라이트유저, 매너 플레이 레기온입니다.',
  keywords: ['나니아 성심당', '아이온2 성심당', '레기온 성심당', '아이온2 레기온', '나니아', '성심당', 'aion2', '아이온2'],
  metadataBase: new URL(BASE_URL),
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    locale: 'ko_KR',
    url: BASE_URL,
    siteName: '나니아 성심당',
    title: '나니아 성심당 - 아이온2 레기온',
    description: '아이온2 레기온 나니아 성심당 공식 홈페이지. 친목, 라이트유저, 매너 플레이 레기온입니다.',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
    },
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko">
      <head>
        <link rel="icon" href="/toast.svg" type="image/svg+xml" />
        {/* 라이트 모드 CSS 변수 — Tailwind v4 빌드 우회용 직접 주입 */}
        <style dangerouslySetInnerHTML={{ __html: `
          [data-theme="light"] {
            --bg-base: #fdf8ef;
            --bg-card: #fff8e8;
            --bg-header: #fffdf5;
            --gold-light: #b07800;
            --gold-mid: #9a6f00;
            --gold-dark: #c8a060;
            --text-main: #2d1f00;
            --text-sub: #7a5a20;
            --text-muted: #b8956a;
            --border-gold: rgba(180,120,0,0.28);
            --border-dark: rgba(180,120,0,0.1);
          }
        `}} />
        {/* 페이지 로드 시 저장된 테마 즉시 적용 (깜빡임 방지) */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var t=localStorage.getItem('theme')||'dark';document.documentElement.setAttribute('data-theme',t);})();`,
          }}
        />
      </head>
      <body className="min-h-screen flex flex-col font-sans" style={{ background: 'var(--bg-base)', color: 'var(--text-main)' }}>
        <ThemeProvider>
          <Header />
          <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-8">
            {children}
          </main>
          <Footer />
        </ThemeProvider>
      </body>
    </html>
  )
}
