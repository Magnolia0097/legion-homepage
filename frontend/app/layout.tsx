import type { Metadata } from 'next'
import '@fontsource/pretendard/400.css'
import '@fontsource/pretendard/700.css'
import './globals.css'
import Header from '@/components/Header'
import Footer from '@/components/Footer'

export const metadata: Metadata = {
  title: '아이온2 레기온',
  description: '아이온2 레기온 공식 홈페이지',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko">
      <body className="bg-gray-950 text-gray-100 min-h-screen flex flex-col font-sans">
        <Header />
        <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-8">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  )
}
