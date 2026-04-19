# Aion 2 Voice Tracker — 프로젝트 개요

> 길드 홈페이지(legion-homepage)의 **"반응" 탭**에 통합되는
> Aion 2 커뮤니티 여론 모니터링 파이프라인.

## 한 줄 설명
여러 커뮤니티의 글/댓글을 자동 수집하고 LLM으로 분류해서
"지금 여론 + 추이 + 급상승 이슈"를 한눈에 보여주는 대시보드.

## 왜 만드는가
- **개인 문제**: 길드 마스터로서 Reddit, 인벤, 디시, 유튜브 댓글을 매번 찾아다니기 귀찮음
- **DE 포트폴리오**: 실사용자(길드원) 있는 서비스에 DE 파이프라인을 통합 — 토이 프로젝트 아님
- **DBA 경력 전환**: Oracle/MariaDB/MaxScale 3년 경력을 PostgreSQL 스키마 설계 + 쿼리 튜닝에 녹여냄

## 핵심 요구사항
1. 여러 소스에서 주기적으로 수집 (Reddit, 인벤, 디시, YouTube 댓글)
2. 비용 거의 0원 유지 (Supabase 무료 + Gemini 무료 + 로컬 필터)
3. "지금(최근 1시간)" + "추이(일/주)" 둘 다 대시보드에 표시
4. 부정 여론의 **세부 카테고리** + **구체적 이슈**까지 드릴다운
5. 새로 터진 이슈는 키워드 급상승으로 자동 감지
6. near real-time (15~60분 주기 미니배치)

## 아키텍처

```
┌──────────────────────────────────────────────────────────┐
│             단일 레포 (legion-homepage)                    │
│                                                          │
│  app/반응/ ─────┐                                        │
│  (대시보드 UI)   │                                        │
│                 ▼                                        │
│  app/api/voice/ ─────┐                                   │
│  (API Routes)         │                                  │
│                       │                                  │
└───────────────────────┼──────────────────────────────────┘
                        │
                        ▼
            ┌───────────────────────┐
            │  Supabase PostgreSQL  │  ← 중심 저장소
            │  (무료 티어, 500MB)    │
            └───────────┬───────────┘
                        │
                        ▲ INSERT/UPDATE
                        │
            ┌───────────┴───────────┐
            │  pipeline/ (Python)    │  ← 같은 레포, 별도 실행
            │  - 수집                 │
            │  - 필터/분류 (Gemini)   │
            │  - 집계                 │
            └───────────┬───────────┘
                        │
                        ▲ cron (30~60분)
                        │
             주찬님 PC 또는 VPS
```

## 기술 스택

### 프론트엔드 (기존 레포에 통합)
- Next.js (기존)
- React + Tailwind (기존)
- Recharts 또는 Tremor (신규 — 대시보드 차트)
- Supabase JS SDK

### 백엔드 (API Routes)
- Next.js API Routes
- Supabase 공식 클라이언트

### 파이프라인 (신규, `/pipeline` 폴더)
- Python 3.11+ (uv로 관리)
- `praw` (Reddit)
- `beautifulsoup4` + `requests` (인벤, 디시)
- `google-generativeai` (Gemini Flash-Lite)
- `supabase-py` (DB 접근)
- `apscheduler` 또는 cron

### 데이터베이스
- Supabase PostgreSQL (무료 티어)
- JSONB 활용 (LLM 결과 구조화 저장)

### 배포
- 프론트엔드: Cloudflare Pages (기존, 자동 배포)
- 파이프라인: 주찬님 PC에서 cron 실행 (MVP), 나중에 Cloudflare Workers Cron 또는 VPS로 이전 고려
- DB: Supabase 관리형

## 데이터 플로우

### 1. 수집
- 스케줄: cron (매 30분~60분)
- 수집 대상:
  - Reddit r/aion (1순위, API 공식)
  - 인벤 Aion 2 게시판 (2순위, HTML 크롤링)
  - 디시 Aion 갤러리 (3순위)
  - YouTube 댓글 (4순위)
- 중복 방지: `(source, external_id)` UNIQUE

### 2. 처리 (3-tier 필터링)
- **Tier 1 — 정규식 필터 (무료, 빠름)**: 스팸/광고/너무 짧은 글 제외
- **Tier 2 — 키워드 매칭 (무료, 빠름)**: 명확한 긍/부 자동 분류
- **Tier 3 — Gemini 분류 (무료 티어, 정밀)**: 애매한 것만 LLM 호출

### 3. LLM 프롬프트 (구조화 JSON 출력)
```json
{
  "sentiment": "positive|negative|neutral",
  "categories": ["클래스밸런스", "과금/BM", "서버/기술", "컨텐츠",
                 "운영/소통", "PvP", "UI/편의성", "기타"],
  "issue_summary": "구체적 이슈 한 문장",
  "keywords": ["핵심단어1", "핵심단어2", "핵심단어3"]
}
```

### 4. 저장 스키마 (Supabase)
- `raw_posts` — 원본 + LLM 결과
- `hourly_stats` — 시간별 집계 (대시보드 "지금")
- `daily_stats` — 일별 집계 (대시보드 "추이")
- `keyword_trends` — 키워드별 시간대 빈도 (급상승 감지)

### 5. 대시보드 (Next.js, `/app/반응`)
- 상단: 최근 1시간 지표 + 부정 카테고리 브레이크다운
- 중단: 일별/주별 감성 추이
- 하단: 🔥 급상승 키워드 + 주요 이슈 TOP 3 (원본 링크 드릴다운)

## 비용 관리 (목표: 월 $0)

| 항목 | 한도 | 예상 사용량 | 여유 |
|------|------|-------------|------|
| Supabase DB | 500MB | ~30MB/월 | 16개월분 |
| Supabase 대역폭 | 5GB/월 | <1GB/월 | 충분 |
| Gemini API | 1,000 RPD | ~300/일 | 충분 |
| Cloudflare Pages | 무제한 | - | 무관 |

**예상 월 비용: $0**
최악 시나리오(무료 티어 초과)도 월 $25 (Supabase Pro)

## 단계별 로드맵

### Week 1 — 최소 동작
- [ ] Supabase 프로젝트 생성 + 스키마 마이그레이션
- [ ] `pipeline/` 폴더 구조 생성
- [ ] Reddit r/aion 수집기 (MVP)
- [ ] Gemini 감성 분류기 (MVP)
- [ ] `/api/voice/now` API 1개
- [ ] `/app/반응` 페이지 기본 UI

### Week 2 — 확장
- [ ] LLM 구조화 JSON 출력
- [ ] 카테고리 브레이크다운 UI
- [ ] 집계 테이블 갱신 로직
- [ ] 일별 추이 차트

### Week 3 — 한국어 소스
- [ ] 인벤 Aion 2 크롤러
- [ ] 이슈 드릴다운 UI

### Week 4 — 고도화
- [ ] 급상승 키워드 탐지
- [ ] Z-score 기반 여론 급변 알림
- [ ] 이상 탐지 로직

### Week 5+ — v2 이전
- [ ] cron → Airflow 마이그레이션 (회고 문서)
- [ ] dbt 변환 레이어
- [ ] 디시/유튜브 소스 추가

## 주의사항
- 크롤링: robots.txt 준수, User-Agent 명시, 2초 이상 간격
- API 키: `.env`로만, `.gitignore` 필수
- NCSoft 이용약관: 인게임 데이터는 수집 안 함, 공개 커뮤니티만
