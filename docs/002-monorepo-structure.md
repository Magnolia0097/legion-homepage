# ADR 002: 모노레포(단일 레포) 구조 채택

**날짜**: 2026-04-19
**상태**: Accepted
**결정자**: 주찬

## 맥락

길드 홈페이지(`legion-homepage`)에 여론 모니터링 대시보드("반응" 탭)를 추가하고,
별도로 Python 파이프라인을 운영해야 한다. 구조 선택지:

1. **모노레포**: 기존 레포에 `/pipeline` 폴더 추가
2. **2개 레포**: `legion-homepage` + 신규 `aion2-voice-pipeline` 분리

## 결정

**모노레포 (단일 레포) 선택.** 기존 `legion-homepage` 레포에 통합.

## 근거

1. **Supabase 스키마 공유** — 프론트(TypeScript)와 파이프라인(Python)이
   같은 DB 스키마를 참조. 모노레포면 `supabase/migrations/`가 한 곳에 있어
   스키마 변경 시 양쪽 동시 업데이트 가능. 2개 레포면 동기화 번거로움.

2. **배포 복잡도 최소화** — Cloudflare Pages가 Next.js 앱만 배포하면 됨.
   파이프라인은 로컬/VPS 실행이므로 Cloudflare 빌드 설정만 손보면 충돌 없음.

3. **비밀키 관리 단순** — `.env` 파일 한 벌로 관리. Reddit/Gemini/Supabase
   키를 한 곳에서 관리하니 공유하거나 동기화할 필요 없음.

4. **실제 프로젝트 간 결합도가 높음** — API Route가 파이프라인이 쓴 데이터를
   읽는 구조. 관심사가 "여론 모니터링"이라는 하나의 도메인으로 묶여 있음.
   분리하면 오히려 인위적.

5. **포트폴리오 어필 방식** — 2026년 현업에서 Next.js + Python 파이프라인을
   모노레포로 두는 건 흔함 (Turborepo, Nx 등). "풀스택 + DE 파이프라인을
   하나의 서비스로 운영"하는 스토리가 일관성 있음.

## 대안을 선택하지 않은 이유

**2개 레포의 단점:**
- 스키마 변경 시 양쪽 레포 동시 업데이트 및 버전 관리 필요
- `.env` 파일 2배로 관리
- CI/CD 파이프라인 2배
- 파이프라인 레포를 비공개로 유지하면서 프론트만 공개하는 장점이 있으나,
  비공개 폴더를 `.gitignore`로 제외하는 방식으로 동일 효과 가능

**2개 레포가 나은 경우 (해당 안 됨):**
- 팀이 분리되어 있어 권한 관리 필요 (해당 없음 — 1인 프로젝트)
- 배포 주기가 완전히 다름 (해당 없음 — 둘 다 주찬님 로컬/Cloudflare)
- 언어별 도구 체인이 심하게 충돌 (해당 없음 — Node/Python 공존 흔함)

## 구조

```
legion-homepage/
├── app/                        # Next.js 앱 (기존)
│   ├── (기존 페이지들)/
│   ├── 반응/                   # 신규 대시보드
│   └── api/voice/              # 신규 API Routes
├── components/                 # React 컴포넌트
├── pipeline/                   # 신규 — Python 파이프라인
│   ├── pyproject.toml
│   ├── src/
│   └── scripts/
├── supabase/                   # 신규 — 공유 DB 스키마
│   ├── migrations/
│   └── types.ts                # 자동 생성 (TS 타입)
├── docs/                       # 신규 — 설계 문서
│   ├── PROJECT.md
│   └── decisions/
└── package.json                # Node 의존성 (기존)
```

## Cloudflare Pages 빌드 시 주의점

- Build command: `npm run build` (기존)
- Root directory: `/` (변경 없음)
- `/pipeline` 폴더는 Next.js 빌드에 포함되지 않음 (Next.js가 `app/`, `pages/`만 인식)
- 빌드 시간에 영향 없음

## 결과 및 위험

**긍정**:
- 단일 진실 원천 (DB 스키마, 환경변수)
- 배포 및 개발 속도 향상

**위험 및 대응**:
- 레포 크기 증가: `.gitignore`로 `.venv`, `logs`, `__pycache__` 제외하면 괜찮음
- Cloudflare 빌드에 Python 파일이 포함될 우려:
  `.cloudflareignore` 또는 `next.config.js`의 설정으로 명시적 배제

## 참고

- Vercel 모노레포 가이드 및 Turborepo 패턴 참고
- Cloudflare Pages 빌드 문서 기준
