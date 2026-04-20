# 세션 핸드오프 문서 — Aion 2 Voice Tracker

## 사용법

새 Claude.ai 또는 Claude Code 세션 시작 시 이 문서 전체를 붙여넣어
프로젝트 컨텍스트를 빠르게 복원한다.

---

## 주찬 프로필

- **직책**: Cloud Infrastructure Engineer (2026년 1월 전환)
- **이전 경력**: DB Solutions Engineer 3년 (Oracle, MariaDB, MaxScale)
- **목표**: 데이터 엔지니어 이직
- **거주**: 대전 둔산동
- **게임**: Aion 2 길드 마스터 (길드명: 성심당, 서버: Nania)
- **학습 스타일**: 큰 그림 먼저, 디테일은 나중에. 작업 중 diff는 잘 안 봄
- **Claude Code 환경**: WSL2 Ubuntu (데스크톱 앱)
- **레포 로컬 경로**: `/home/user/legion-homepage`

---

## 프로젝트 정체성

**이름**: Aion 2 Voice Tracker
**한 줄 설명**: 인벤/디시/YouTube 등 한국 게임 커뮤니티 여론을 자동 수집·LLM 분류·대시보드 표시

**왜 만드는가**:
1. 길드 마스터로서 커뮤니티 여론을 매번 직접 찾아보는 게 귀찮음
2. 데이터 엔지니어 이직용 포트폴리오 (실사용자 있는 서비스)
3. Oracle/MariaDB 경력을 PostgreSQL + Python DE 파이프라인으로 확장

**비용 목표**: 월 $0 (Supabase 무료 500MB + Gemini 무료 티어)

---

## 현재 진행 상태

- **최신 커밋**: `da64113`
- **브랜치**: master (직접 커밋 방식)

### 완료 Task
- ✅ Task 1: 폴더 구조 (pipeline/, supabase/migrations/, docs/)
- ✅ Task 2: Supabase SQL 스키마 (`001_voice_tracker.sql` 작성, **실행은 주찬이 직접**)
- ✅ Task 3: TypeScript 타입 수동 작성 (`supabase/types.ts`)
- ✅ Task 4: pipeline/ Python 세팅 (pyproject.toml, config.py, db.py)

### 다음 Task
- ⏳ **Task 5**: `pipeline/src/collectors/inven.py` — 인벤 Aion 2 크롤러

---

## 작업 스타일

| 항목 | 내용 |
|------|------|
| 커밋/푸시 | 자동 (세세한 diff 확인 안 함) |
| 보고 형식 | 변경 요약 · 내가 결정한 사항 · 학습 문서 · 알아야 할 것 · 다음 단계 |
| 학습 문서 | 매 Task 완료 시 `docs/learning/NN-topic.md` 자동 생성 |
| 작업 단위 | 큰 덩어리 우선, 한 세션에 Task 1개 완주 지향 |
| git | 터미널 직접 사용 안 함. 모든 git 작업은 Claude Code에 위임 |
| 브랜치 | master 직접 커밋. PR/브랜치 생성 금지 (대규모 리팩토링 제외) |

---

## 중요 의사결정 (ADR)

| # | 결정 | 핵심 근거 |
|---|------|-----------|
| [ADR 001](docs/001-supabase-database.md) | DB: Supabase PostgreSQL | 무료 500MB, RLS, JS/Python SDK |
| [ADR 002](docs/002-monorepo-structure.md) | 모노레포 유지 | 스키마 공유, 배포 단순화 |
| [ADR 003](docs/003-mini-batch-scheduling.md) | 미니배치 30분 주기 | 비용 0원, near real-time 충분 |
| [ADR 004](docs/decisions/004-data-source-pivot.md) | 인벤 1순위 (Reddit 제외) | Reddit RBP API 중단, 한국어가 실질 여론 |

---

## 기술 스택

| 레이어 | 기술 |
|--------|------|
| 프론트 | Next.js (output: export), Tailwind, Supabase JS SDK |
| API | Next.js API Routes |
| 파이프라인 | Python 3.11, uv, pydantic-settings, beautifulsoup4, lxml, google-generativeai |
| DB | Supabase PostgreSQL (무료), JSONB, RLS, 부분 인덱스 |
| 배포 | Cloudflare Pages (Root: frontend/), 로컬 cron |
| LLM | Gemini 2.5 Flash (250 RPD 무료, 한국어 few-shot) |

---

## 비용 정책

- **목표**: 월 $0
- Supabase 무료 (500MB, 예상 사용 ~30MB/월)
- Gemini Flash 무료 (250 RPD, 3-tier 필터로 LLM 호출 최소화)
- Cloudflare Pages 무료

---

## 하드 제약

1. **레포 공개 상태**: 현재 GitHub public (원래 비공개 선호). 민감 정보 커밋 절대 금지
2. **저작권**: 인벤 원문 제목/본문을 대시보드에 그대로 노출 금지. LLM 생성 `issue_summary`만 표시
3. **NCSoft 이용약관**: 인게임 데이터 수집 금지. 공개 커뮤니티 게시글만
4. **`.env` 커밋 금지**: `.gitignore`에 등록됨. service_role key는 pipeline 내부에서만

---

## 소프트 선호

- 실사용 가능한 서비스 (토이 프로젝트 아님)
- DBA 경력 차별화 (PostgreSQL 스키마 설계, 인덱스 튜닝)
- 한국어 NLP 역량 실전 검증
- 비정형 소스 통합 경험 (API보다 크롤링이 포트폴리오 가치 높음)

---

## 커뮤니케이션 톤

- 직설적이고 솔직한 조언 선호
- 불필요한 설명 최소화, 핵심만
- 잘못된 방향이면 바로 말해줄 것

---

## 외부 서비스 상태

| 서비스 | 용도 | 현재 상태 |
|--------|------|-----------|
| Supabase `legion-voice` | 중앙 DB | **미생성** — 주찬이 직접 생성 + SQL 실행 필요 |
| Gemini API | LLM 분류 | **키 미발급** — Google AI Studio에서 발급 필요 |
| Cloudflare Pages `nania-ssimdang` | 프론트 배포 | 운영 중 |
| GitHub `Magnolia0097/legion-homepage` | 소스 관리 | 공개 상태 |

---

## 알려진 이슈 / TODO

1. Supabase `001_voice_tracker.sql` 대시보드 SQL Editor에서 실행 필요
2. `pipeline/.env` 파일 주찬이 직접 생성 (`pipeline/.env.example` 복사 후 키 입력)
3. Gemini API 키 발급 필요

---

## 다음 작업 (Task 5)

**파일**: `pipeline/src/collectors/inven.py`

**구현 내용**:
- `collect_inven_aion2(board_id=6388, max_pages=1, sleep_seconds=3.0)`
- `parse_post_list(html: str) → list[dict]`
- `save_posts(posts: list[dict]) → int`
- robots.txt 자동 체크 (`urllib.robotparser`)
- `time.sleep(3)` 필수 (IP 차단 방지)
- 반환 스키마: `source="inven_aion2"`, `external_id=f"6388_{post_id}"`

참조: `docs/WEEK1_TASKS.md` Task 5, `docs/decisions/004-data-source-pivot.md`

---

## Claude에게 추가 지시

> 이 섹션에 특별 지시사항을 추가해서 사용하세요.

- `.claude/WORKFLOW.md` 규칙을 항상 준수할 것
- 매 Task 완료 시 `.claude/CONTEXT.md`와 이 파일의 "현재 진행 상태" 섹션 업데이트
- 모호한 건 먼저 물어볼 것 (단, WORKFLOW.md 자동 진행 대상은 바로 실행)
