This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## 반응 탭 (Voice Tracker Dashboard)

Aion 2 커뮤니티 여론 모니터링 대시보드.

### 신규 라우트

- `/reactions` — 반응 탭 메인 페이지

### 신규 API (개발 서버 전용, `next dev`)

> `output: 'export'` 정적 빌드에서는 동작하지 않음.
> 프로덕션에서는 Supabase JS 클라이언트 직접 호출 방식으로 교체 예정.

- `GET /api/voice/now` — 최근 1시간 통계
- `GET /api/voice/trend?days=N` — 최근 N일 일별 통계
- `GET /api/voice/issues?limit=N` — 주요 이슈 TOP N

### 현재 상태

Mock 데이터 사용 중. 실 데이터 연결은 `docs/NEXT_WEEKEND.md` 참조.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
