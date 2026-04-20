# 용어 사전 — Aion 2 Voice Tracker

프로젝트에서 등장하는 용어 정의. 처음 읽는 사람도 이해할 수 있도록 2~3줄로 설명.

---

## 게임 / 커뮤니티

**Aion 2**
NCSoft가 개발한 MMORPG의 후속작. 2025년 출시. 본 프로젝트의 여론 수집 대상.
[공식 사이트](https://aion2.plaync.com/)

**인벤 (Inven)**
한국 최대 게임 커뮤니티 포털. Aion 2 게시판(`www.inven.co.kr/board/aion2/`)이
여론의 주요 창구. 본 프로젝트 1순위 수집 소스.
관련: [ADR 004](../decisions/004-data-source-pivot.md)

**게시판 ID (6388 등)**
인벤 각 게시판을 구분하는 숫자 코드.
- `6388` — Aion 2 자유 게시판 (여론 수집 1순위)
- `6444` — 팁과 노하우
- `6447` — 서버 게시판

**NCSoft**
Aion 2 개발사. 한국 법인. 본 프로젝트는 인게임 데이터를 수집하지 않으며,
공개 커뮤니티 게시글만 분석 대상으로 삼는다.

---

## 개발 방법론

**ADR (Architecture Decision Record)**
중요한 설계 결정을 기록하는 문서 형식. "무엇을 결정했고, 왜 그렇게 했는지"를
나중에 돌아볼 수 있게 남긴다. `docs/decisions/` 폴더에 보관.
[참고: Michael Nygard의 ADR 형식](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions)

**Conventional Commits**
커밋 메시지 작성 규칙. `feat:`, `fix:`, `docs:` 등 접두어로 변경 유형을 명시.
PR 자동 생성, CHANGELOG 자동화에 유리하다.
[공식 스펙](https://www.conventionalcommits.org/)

**Monorepo (모노레포)**
여러 하위 프로젝트(프론트엔드, 파이프라인)를 하나의 Git 레포지토리에서 관리하는 방식.
본 프로젝트는 `frontend/`(Next.js)와 `pipeline/`(Python)을 단일 레포에서 운영.
관련: [ADR 002](../decisions/002-monorepo-structure.md)

---

## 데이터베이스

**Supabase**
PostgreSQL 기반 BaaS(Backend-as-a-Service). 무료 티어(500MB)로 운영.
인증, RLS, 실시간 구독, REST API를 기본 제공.
관련: [ADR 001](../decisions/001-supabase-database.md)

**PostgreSQL**
오픈소스 관계형 데이터베이스. Supabase의 기반 엔진.
표준 SQL을 지원하며 JSONB, 부분 인덱스 등 고급 기능 보유.

**JSONB**
PostgreSQL의 이진(binary) JSON 저장 타입. 일반 JSON보다 조회 속도가 빠르고
GIN 인덱스 적용 가능. 본 프로젝트에서 `categories`, `keywords` 등 가변 구조
데이터를 저장할 때 사용.
```sql
-- 예시: categories 컬럼에서 '클래스밸런스' 포함 글 조회
SELECT * FROM voice_raw_posts
WHERE categories @> '["클래스밸런스"]';
```

**RLS (Row Level Security)**
PostgreSQL의 행 단위 접근 제어. 테이블마다 "어떤 조건의 행을 읽을 수 있는지"를
정책(Policy)으로 정의. 본 프로젝트에서는 읽기는 공개(anon key), 쓰기는
service role key만 허용.
```sql
CREATE POLICY "Public read" ON voice_raw_posts FOR SELECT USING (true);
```

**TIMESTAMPTZ**
시간대 정보(timezone)를 포함하는 PostgreSQL 타임스탬프 타입.
`TIMESTAMP`(시간대 없음)보다 권장. Supabase는 UTC로 저장, 클라이언트가 변환.

**UPSERT**
INSERT + UPDATE를 합친 개념. 이미 존재하면 UPDATE, 없으면 INSERT.
PostgreSQL에서는 `INSERT ... ON CONFLICT DO UPDATE`로 구현.
중복 수집 방지에 활용.

---

## LLM / AI

**Gemini**
Google의 대형 언어 모델(LLM) 패밀리. 본 프로젝트에서 게시글 감성 분류에 사용.
[Google AI Studio](https://aistudio.google.com/)에서 무료 API 키 발급 가능.

**Flash / Flash-Lite**
Gemini 모델 경량 버전.
- `gemini-2.5-flash`: 무료 250 RPD(일일 요청). 한국어 분류 정확도 우수. 본 프로젝트 채택.
- `gemini-2.5-flash-lite`: 무료 1,000 RPD. 더 빠르지만 복잡한 한국어에서 정확도 낮을 우려.

**Few-shot Prompt (퓨샷 프롬프트)**
LLM에게 예시(shot)를 몇 개 보여주어 출력 형식과 방향을 유도하는 기법.
"예시 없음(zero-shot)"보다 정확도가 높고 일관된 JSON 출력을 얻기 좋다.
```python
# 예시: 3개의 예시로 분류 방향 유도
"""
- "글라디 버프 감사합니다" → positive
- "서버 또 터졌냐" → negative
- "점검 몇 시까지?" → neutral
"""
```

**RPD / RPM**
- RPD(Requests Per Day): 일일 요청 한도
- RPM(Requests Per Minute): 분당 요청 한도
Gemini 무료 티어: Flash 기준 250 RPD, 15 RPM. 4초 간격 유지 필요.

---

## 파이프라인 / 인프라

**Mini-batch (미니배치)**
대용량 데이터를 한 번에 처리하지 않고 소규모 단위로 나누어 주기적으로 처리하는 방식.
본 프로젝트는 30~60분마다 최근 게시글만 수집·분류. 실시간보다 비용 효율적.
관련: [ADR 003](../decisions/003-mini-batch-scheduling.md)

**cron**
Unix/Linux 시스템의 작업 스케줄러. `*/30 * * * *` 형식으로 실행 주기 지정.
본 프로젝트에서 파이프라인을 30분마다 자동 실행하는 데 사용.
```bash
# 매 30분 실행 예시
*/30 * * * * cd /path/to/pipeline && uv run python scripts/run_pipeline.py
```

**Z-score**
통계적 이상 탐지 지표. 평균 대비 표준편차 몇 배 떨어졌는지를 나타냄.
Week 4 예정 기능: 여론이 갑자기 급변할 때 Z-score로 감지 후 알림.
`Z = (현재값 - 평균) / 표준편차`

**uv**
Python 패키지 관리 도구. `pip` + `venv`를 대체하는 고속 툴체인.
`pyproject.toml` 기반으로 의존성 관리. `uv sync`, `uv run` 명령 사용.
[공식 문서](https://docs.astral.sh/uv/)

**robots.txt**
웹사이트가 크롤러에게 "어느 경로는 수집해도 되고 안 되는지" 알려주는 파일.
`/robots.txt` 경로에 위치. 본 프로젝트는 인벤 robots.txt 확인 후 수집 경로 결정.
관련: [ADR 004 검증 기록](../decisions/004-data-source-pivot.md#검증-기록)
