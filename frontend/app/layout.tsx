import type { Metadata } from 'next'
import '@fontsource/pretendard/400.css'
import '@fontsource/pretendard/700.css'
import './globals.css'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import BottomNav from '@/components/BottomNav'
import { ThemeProvider } from '@/components/ThemeProvider'

const BASE_URL = 'https://nania-ssimdang.pages.dev'

export const metadata: Metadata = {
  title: {
    default: '나니아 성심당 - 아이온2 레기온',
    template: '%s | 나니아 성심당',
  },
  description: '아이온2 레기온 나니아 성심당 공식 홈페이지. 친목 · 라이트유저 · 매너 플레이를 추구하는 성심당 레기온입니다.',
  keywords: [
    '나니아 성심당', '성심당 레기온', '아이온2 성심당', '아이온2 레기온',
    '나니아 레기온', '성심당', '나니아', '아이온2', 'aion2', '아이온2 길드',
  ],
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
    description: '아이온2 레기온 나니아 성심당 공식 홈페이지. 친목 · 라이트유저 · 매너 플레이를 추구하는 성심당 레기온입니다.',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
    },
  },
  verification: {
    google: 'gn6PpKrdrGN2DPopfZYqM23RMGMguk97YQNAe3rdlwA',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko" suppressHydrationWarning data-preview-theme="a">
      <head>
        <link rel="icon" href="/toast.svg" type="image/svg+xml" />
        {/* 라이트 모드 + A안 테마 CSS 변수 — Tailwind v4 빌드 우회용 직접 주입 */}
        <style dangerouslySetInnerHTML={{
          __html: `
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
          [data-preview-theme="a"] {
            --bg-base: #0d0a06;
            --bg-card: #141009;
            --bg-header: #090705;
            --gold-light: #f0d485;
            --gold-mid: #e8c870;
            --gold-dark: #a07830;
            --text-main: #f8f0d8;
            --text-sub: #c8aa70;
            --text-muted: #907850;
            --border-gold: rgba(232,200,112,0.38);
            --border-dark: rgba(232,200,112,0.15);
          }
          [data-preview-theme="a"][data-theme="light"] {
            --bg-base: #faf5e8;
            --bg-card: #fffbf0;
            --bg-header: #fffef8;
            --gold-light: #8a5c00;
            --gold-mid: #7a5200;
            --gold-dark: #c8a050;
            --text-main: #1a1000;
            --text-sub: #60461a;
            --text-muted: #a88050;
            --border-gold: rgba(138,92,0,0.3);
            --border-dark: rgba(138,92,0,0.12);
          }
        `}} />
        {/* 페이지 로드 시 저장된 테마 + A안 즉시 적용 (깜빡임 방지) */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var t=localStorage.getItem('theme')||'dark';document.documentElement.setAttribute('data-theme',t);document.documentElement.setAttribute('data-preview-theme','a');})();`,
          }}
        />
      </head>
      <body className="min-h-screen flex flex-col font-sans" style={{ background: 'var(--bg-base)', color: 'var(--text-main)' }}>
        <ThemeProvider>
          <Header />
          {/* 최고관리자 히어로 포탈 마운트 포인트 — 비어있을 때는 렌더링 없음 */}
          <div id="hero-root" />
          <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-8 pb-20 md:pb-8">
            {children}
          </main>
          <Footer />
          <BottomNav />
        </ThemeProvider>
      </body>
    </html>
  )
}
