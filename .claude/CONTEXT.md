# Claude Code 컨텍스트 스냅샷

> 새 세션 시작 시 이 파일을 먼저 읽어 프로젝트 현황을 파악할 것.
> Task 완료 시마다 "현재 진행 상태" 섹션 자동 업데이트.

---

## 프로젝트 정체성

- **이름**: Aion 2 Voice Tracker
- **목적**: 인벤/디시/YouTube 등 커뮤니티 여론을 자동 수집·LLM 분류·대시보드 표시
- **위치**: 기존 길드 홈페이지(`legion-homepage`) "반응" 탭에 통합
- **목표**: 데이터 엔지니어 이직용 포트폴리오 + 길드원 실사용 서비스
- **비용 목표**: 월 $0 (Supabase 무료 + Gemini 무료 티어)

---

## 레포 구조

```
/home/user/legion-homepage/
├── frontend/              # Next.js 앱 (Cloudflare Pages 배포, Root=frontend/)
├── pipeline/              # Python 파이프라인 (로컬 cron 실행)
│   ├── pyproject.toml
│   ├── src/
│   │   ├── config.py      # pydantic-settings BaseSettings
│   │   ├── db.py          # Supabase 클라이언트 싱글톤
│   │   ├── collectors/    # 수집기 (인벤 등)
│   │   ├── processors/    # 필터 + Gemini 분류기
│   │   └── aggregators/   # 시간별·일별 집계
│   └── scripts/
│       └── run_pipeline.py
├── supabase/
│   ├── migrations/        # SQL 스키마 파일
│   └── types.ts           # TypeScript 타입 (수동 작성)
├── docs/
│   ├── decisions/         # ADR 001~004
│   ├── learning/          # 학습 문서 (Task 완료 시 자동 생성)
│   └── journal/           # 개발 일지 (직접 작성)
└── .claude/
    ├── CONTEXT.md         # 이 파일
    └── WORKFLOW.md        # 작업 규칙
```

---

## 핵심 기술 결정 (ADR 요약)

| ADR | 결정 | 핵심 근거 |
|-----|------|-----------|
| [001](docs/001-supabase-database.md) | DB로 Supabase 선택 | 무료 500MB, RLS 내장, JS/Python 클라이언트 |
| [002](docs/002-monorepo-structure.md) | 모노레포 유지 | 스키마 공유, 비밀키 단일 관리 |
| [003](docs/003-mini-batch-scheduling.md) | 미니배치 스케줄링 | 비용 0원, 30분 주기 cron |
| [004](docs/decisions/004-data-source-pivot.md) | 인벤 1순위로 전환 | Reddit RBP로 API 셀프 서비스 중단, 한국어 소스가 실질 여론 |

---

## 현재 진행 상태

- **최신 커밋**: feat: Task 11~13 — 반응 탭 대시보드 (Mock 데이터)
- **현재 브랜치**: claude/create-folder-structure-Cd1D0 (PR 경유 → master 예정)

### 완료된 Task
- ✅ Task 1: 폴더 구조 생성 (pipeline/, supabase/migrations/, docs/)
- ✅ Task 2: Supabase 스키마 마이그레이션 (`001_voice_tracker.sql`)
- ✅ Task 3: TypeScript 타입 수동 작성 (`supabase/types.ts`)
- ✅ Task 4: pipeline/ Python 프로젝트 세팅 (pyproject.toml, config.py, db.py)
- ✅ Task 5: 인벤 크롤러 구현 (`collectors/inven.py`, `scripts/test_inven.py`)
  - ⚠️ 샌드박스 네트워크 제한 → 실제 수집 테스트는 로컬 PC에서 필요
  - `_check_robots()` 버그 수정: robots.txt 403 시 허용으로 간주
- ✅ Task 6: 정규식 스팸 필터 (`processors/filter.py`, `tests/test_filter.py`)
  - 22/22 pytest 통과
  - 학습 문서: `docs/learning/05-filter-design.md`
- ✅ Task 7: Gemini 감성 분류기 (`processors/classifier.py`, `tests/test_classifier.py`)
  - 12/12 pytest 통과 (mock 기반)
  - google-genai 신 SDK 사용 (google-generativeai deprecated 대응)
  - 학습 문서: `docs/learning/06-llm-classification.md`
- ✅ Task 8: 파이프라인 오케스트레이터 (`scripts/run_pipeline.py`, `tests/test_run_pipeline.py`)
  - 6/6 pytest 통과 (mock 기반)
  - db.py에 `fetch_unclassified`, `mark_as_spam` 추가
  - `.env` SUPABASE_URL 플레이스홀더 수정 (xxxx → ospcbkfmsxludkoshcxt)
  - 학습 문서: `docs/learning/07-pipeline-orchestrator.md`
- ✅ Task 9: cron 실행 스크립트 (`scripts/run.sh`, 학습문서 `docs/learning/08-cron-setup.md`)
- ✅ Task 10: 집계 모듈 (`pipeline/src/aggregators/hourly.py`, `tests/test_aggregators.py`)
  - refresh_hourly_stats / refresh_daily_stats 구현
  - run_pipeline.py 5단계(집계) 통합
  - 학습 문서: `docs/learning/09-aggregation.md`
- ✅ 브랜치 정리: PR #4 → master 머지 완료 (merge commit)
- ✅ Task 11: API Routes (`frontend/app/api/voice/{now,trend,issues}/route.ts`, force-static)
  - Mock 데이터: `frontend/app/api/voice/_mock/*.ts`
  - `next build` 통과 확인
- ✅ Task 12: 대시보드 페이지 + 컴포넌트
  - `frontend/app/reactions/page.tsx`
  - `frontend/components/voice/` — NowStats, TrendChart, IssueCard, SentimentBadge
  - recharts 추가 (PieChart, LineChart)
  - Header + BottomNav에 "반응" 탭 추가
- ✅ Task 13: 학습 문서 + 가이드
  - `docs/learning/10-frontend-dashboard.md`
  - `docs/NEXT_WEEKEND.md` — Supabase 연결 단계별 가이드
  - `frontend/app/api/voice/README.md`
  - `frontend/README.md` 업데이트

### 다음 Task
- ⏳ **다음 주말**: Supabase 실 데이터 연결 (`docs/NEXT_WEEKEND.md` 참조)

### 외부 서비스 상태
- **Supabase**: 프로젝트 미생성 (주찬이 직접 생성 예정). SQL 실행 상태 **확인 필요**
- **Gemini API**: 키 미발급 (주찬이 직접 발급 예정)
- **`.env` 파일**: 주찬이 직접 생성 예정 (`pipeline/.env.example` 참고)
- **Cloudflare Pages**: 배포 중 (사이트: nania-ssimdang, Root=frontend/)
- **GitHub**: Magnolia0097/legion-homepage (현재 공개 상태)

---

## 작업 규칙 요약 (상세: `.claude/WORKFLOW.md`)

**자동 커밋/푸시 대상**: 문서, 보일러플레이트, SQL 스키마(명세 있는 것), ADR, 테스트, 설정 파일

**반드시 확인 요청**: LLM 프롬프트 변경, RLS 정책 수정, 신규 DB 마이그레이션(001 외), `.env` 관련, frontend/ 코드 수정, 삭제 작업

**보고 형식**: 변경 요약 · 내가 결정한 사항 · 학습 문서 업데이트 · 주찬이 알아야 할 것 · 다음 단계

**브랜치**: master 직접 커밋. 새 브랜치/PR 생성 금지 (대규모 리팩토링 제외)

**매 Task 완료 시**: `docs/learning/` 문서 생성 + 이 파일 진행 상태 업데이트

---

## 알려진 미해결 이슈

1. **Supabase 미설정**: `001_voice_tracker.sql` 대시보드 SQL Editor에서 실행 필요
2. **`.env` 미생성**: `pipeline/.env.example`을 복사해서 키 입력 필요
3. **cron 미등록**: 로컬 PC에서 `crontab -e` 로 `scripts/run.sh` 등록 필요 (08-cron-setup.md 참고)

---

## 외부 서비스 정보

| 서비스 | 용도 | 상태 |
|--------|------|------|
| Supabase `legion-voice` | 중앙 DB | 미생성 |
| Gemini API | LLM 분류 (Flash, 250 RPD) | 키 미발급 |
| Cloudflare Pages `nania-ssimdang` | 프론트 배포 | 운영 중 |
| GitHub `Magnolia0097/legion-homepage` | 소스 관리 | 공개 (비공개 선호) |

---

## 참고 문서

- [docs/PROJECT.md](docs/PROJECT.md) — 전체 아키텍처
- [docs/WEEK1_TASKS.md](docs/WEEK1_TASKS.md) — Task 체크리스트
- [docs/learning/](docs/learning/) — 학습 문서 모음
- [.claude/WORKFLOW.md](.claude/WORKFLOW.md) — 작업 규칙 전문
- [docs/SESSION_HANDOFF.md](docs/SESSION_HANDOFF.md) — 새 세션 핸드오프 문서
