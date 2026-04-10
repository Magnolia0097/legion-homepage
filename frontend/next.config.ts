import type { NextConfig } from 'next'

// 프로덕션 빌드 시 필수 환경변수 검증
if (process.env.NODE_ENV === 'production') {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL
  if (!apiUrl || apiUrl.includes('localhost')) {
    throw new Error(
      `[next.config] NEXT_PUBLIC_API_URL이 잘못 설정되어 있습니다: "${apiUrl}"\n` +
      '  .env.production 파일을 확인하거나 npm run deploy를 사용하세요.'
    )
  }
}

const nextConfig: NextConfig = {
  output: 'export',
  trailingSlash: true,
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.r2.dev',
      },
    ],
  },
}

export default nextConfig
