# Week 1 — MVP 작업 분해

Claude Code에게 순서대로 시키면 되는 체크리스트.
각 Task는 한 세션 규모.

## Prerequisites (시작 전 준비)

- [ ] Supabase 계정 생성 + 새 프로젝트 (`legion-voice` 같은 이름)
- [ ] Supabase DB URL + anon key + service role key 확보
- [ ] Reddit 개발자 앱 등록 → 보류 (ADR 004 참조, 현재 셀프 서비스 중단됨)
- [ ] 인벤 Aion 2 게시판 구조 수동 탐색 (1회)
  - aion2.inven.co.kr 메인
  - 게시판 ID 목록: 6388(자유), 6444(팁), 6447(서버) 등
  - robots.txt 확인: https://www.inven.co.kr/robots.txt
- [ ] Google AI Studio에서 Gemini API 키 발급
- [ ] 기존 `legion-homepage` 레포 로컬 체크아웃

## Day 1 — 스키마 + 폴더 구조

### Task 1: 레포에 신규 폴더 추가
기존 `legion-homepage` 레포에 아래 폴더들 추가:
```
legion-homepage/
├── pipeline/              ← 신규
├── supabase/migrations/   ← 신규
└── docs/                  ← 신규
```

**Claude Code 프롬프트 예시:**
> 이 레포에 `/pipeline`, `/supabase/migrations`, `/docs` 폴더 만들고, 각 폴더에 README 스텁 넣어줘. `.gitignore`에 `pipeline/.env`, `pipeline/__pycache__`, `pipeline/.venv` 추가해줘. Cloudflare Pages가 pipeline 폴더 무시하도록 `.cloudflareignore` 또는 빌드 설정 확인해줘.

### Task 2: Supabase 스키마 마이그레이션
`supabase/migrations/001_voice_tracker.sql` 파일 작성:

```sql
-- 원본 + LLM 결과
CREATE TABLE IF NOT EXISTS voice_raw_posts (
    id BIGSERIAL PRIMARY KEY,
    source VARCHAR(30) NOT NULL,  -- 'inven_aion2', 'dcinside_aion2' 등 세분화된 식별자
    external_id VARCHAR(200) NOT NULL,
    url TEXT,
    title TEXT,
    body TEXT,
    author VARCHAR(100),
    posted_at TIMESTAMPTZ NOT NULL,
    collected_at TIMESTAMPTZ DEFAULT NOW(),

    -- LLM 분류 결과
    sentiment VARCHAR(10),   -- 'positive' | 'negative' | 'neutral'
    categories JSONB,        -- ["클래스밸런스", "PvP"]
    issue_summary TEXT,
    keywords JSONB,          -- ["글라디", "버프"]
    classified_at TIMESTAMPTZ,

    UNIQUE(source, external_id)
);

CREATE INDEX idx_voice_posts_posted_at ON voice_raw_posts(posted_at DESC);
CREATE INDEX idx_voice_posts_sentiment ON voice_raw_posts(sentiment);
CREATE INDEX idx_voice_posts_source ON voice_raw_posts(source);
CREATE INDEX idx_voice_posts_classified ON voice_raw_posts(classified_at)
    WHERE classified_at IS NULL;  -- 부분 인덱스로 미분류만 빠르게 조회

-- 시간별 집계
CREATE TABLE IF NOT EXISTS voice_hourly_stats (
    hour TIMESTAMPTZ PRIMARY KEY,
    total_count INT DEFAULT 0,
    positive_count INT DEFAULT 0,
    negative_count INT DEFAULT 0,
    neutral_count INT DEFAULT 0,
    categories JSONB,        -- {"클래스밸런스": 12, "과금": 8}
    top_keywords JSONB,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 일별 집계
CREATE TABLE IF NOT EXISTS voice_daily_stats (
    day DATE PRIMARY KEY,
    total_count INT DEFAULT 0,
    positive_count INT DEFAULT 0,
    negative_count INT DEFAULT 0,
    neutral_count INT DEFAULT 0,
    categories JSONB,
    top_keywords JSONB,
    top_issues JSONB,        -- 주요 이슈 TOP 5
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS (Row Level Security): 읽기 공개, 쓰기는 service role만
ALTER TABLE voice_raw_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_hourly_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_daily_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read" ON voice_raw_posts FOR SELECT USING (true);
CREATE POLICY "Public read" ON voice_hourly_stats FOR SELECT USING (true);
CREATE POLICY "Public read" ON voice_daily_stats FOR SELECT USING (true);
```

Supabase 대시보드 SQL 에디터에서 실행하거나, Supabase CLI로 `supabase db push`.

**중요:** 테이블명에 `voice_` 접두어 — 기존 길드 홈페이지 테이블과 충돌 방지.

### Task 3: TypeScript 타입 자동 생성
```bash
npx supabase gen types typescript --project-id YOUR_PROJECT_ID > supabase/types.ts
```
프론트에서 import 해서 타입 안전하게 사용.

## Day 2~3 — 파이프라인 기초

### Task 4: `pipeline/` 폴더 Python 프로젝트 세팅
```
pipeline/
├── pyproject.toml        # uv 사용
├── .env.example
├── .python-version       # 3.11
├── README.md
├── src/
│   ├── __init__.py
│   ├── config.py         # 환경변수 로드
│   ├── db.py             # Supabase 클라이언트
│   ├── collectors/
│   │   ├── __init__.py
│   │   └── inven.py
│   ├── processors/
│   │   ├── __init__.py
│   │   ├── filter.py
│   │   └── classifier.py
│   └── aggregators/
│       ├── __init__.py
│       └── hourly.py
├── scripts/
│   └── run_pipeline.py
└── tests/
    └── test_filter.py
```

**의존성 (pyproject.toml):**
```toml
[project]
name = "voice-pipeline"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
    "google-generativeai>=0.8",
    "supabase>=2.8",
    "python-dotenv>=1.0",
    "beautifulsoup4>=4.12",
    "lxml>=5.0",          # BS4 파서, 선택적
    "requests>=2.32",
    "pydantic>=2.9",
]

[dependency-groups]
dev = [
    "pytest>=8.3",
    "ruff>=0.8",
]
```

**`.env.example` 내용:**
```
# 인벤 크롤러
INVEN_USER_AGENT=legion-voice-tracker/0.1 (aion2-community-sentiment; contact: [이메일])
INVEN_REQUEST_INTERVAL=3.0
INVEN_BOARD_IDS=6388,6444,6447

# Gemini API
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash

# Supabase
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

### Task 5: 인벤 Aion 2 크롤러 (`pipeline/src/collectors/inven.py`)

**목적**: 인벤 Aion 2 자유 게시판(6388)의 최근 게시글 수집

**구현 요구사항:**

1. **요청 매너 엄수**
   - User-Agent: `legion-voice-tracker/0.1 (aion2-community-sentiment; contact: [이메일])`
   - 요청 간격: `time.sleep(3)` 최소 3초 — **절대 제거 금지 (IP 차단 위험)**
   - 세션 재사용: `requests.Session()`
   - 타임아웃: 10초

2. **robots.txt 체크 (코드로 자동화)**
   ```python
   from urllib.robotparser import RobotFileParser
   rp = RobotFileParser()
   rp.set_url("https://www.inven.co.kr/robots.txt")
   rp.read()
   if not rp.can_fetch(USER_AGENT, target_url):
       logger.warning("robots.txt 차단, 스킵")
       return []
   ```

3. **수집 범위**
   - 한 실행 당: 자유 게시판 1페이지(약 20~30건)만
   - 중복은 `(source='inven_aion2', external_id)` UNIQUE로 자동 스킵
   - 댓글은 v2에서 추가

4. **파싱 대상** (목록 페이지 — v1 MVP)
   - 게시글 URL: `/board/aion2/6388/{post_id}` 패턴에서 post_id 추출
   - 제목, 작성자, 작성일시, 댓글 수
   - 본문은 v1.1에서 추가 (상세 페이지 수집)

**주요 함수 시그니처:**
```python
def collect_inven_aion2(
    board_id: int = 6388,
    max_pages: int = 1,
    sleep_seconds: float = 3.0,
) -> list[dict]:
    """인벤 Aion 2 게시판 최근 글 수집."""
    ...

def parse_post_list(html: str) -> list[dict]:
    """목록 페이지 HTML에서 게시글 메타데이터 추출."""
    ...

def save_posts(posts: list[dict]) -> int:
    """Supabase insert, 중복 스킵, 저장 건수 반환."""
    ...
```

**반환 데이터 스키마:**
```python
{
    "source": "inven_aion2",
    "external_id": f"6388_{post_id}",
    "url": f"https://www.inven.co.kr/board/aion2/6388/{post_id}",
    "title": "...",
    "body": None,      # v1.1에서 채움
    "author": "...",
    "posted_at": datetime,
}
```

**테스트 체크:**
- 1페이지 수집 시 20~30건 가져오는지
- 중복 실행 시 추가 insert 0건인지
- robots.txt 차단 시나리오에서 crash 없이 스킵되는지

**⚠️ 주의:** HTML 구조는 예고 없이 변경될 수 있으므로 파싱 함수를 모듈화. 원문/제목을 대시보드에 그대로 노출 금지 (ADR 004 참조).

### Task 6: 정규식 필터 (`pipeline/src/processors/filter.py`)
- 15자 미만 글 제외
- 광고 패턴 (URL + "판매", "문의주세요" 등) 제외
- 이모지만 있는 글 제외
- **스팸 필터 규칙은 `FILTER_RULES` 딕셔너리로 관리** (나중에 수정 쉽도록)

### Task 7: Gemini 감성 분류기 (`pipeline/src/processors/classifier.py`)
- 모델: `gemini-2.5-flash` (Flash-Lite 대비 한국어 분류 정확도 향상, 무료 250 RPD로 충분)
- `response_mime_type="application/json"` 옵션으로 JSON 출력 강제
- Few-shot 프롬프트 (한국어 + Aion 2 맥락 강화):
```python
PROMPT = """너는 Aion 2 커뮤니티 여론 분석 전문가야.
다음 게시글의 감성과 주제를 분류해.

감성 라벨: positive, negative, neutral

주제 카테고리 (여러 개 가능):
- 클래스밸런스: 특정 클래스 강함/약함, 버프/너프
- 과금BM: 유료 아이템, 확률, 가격 관련
- 서버기술: 렉, 점검, 버그, 접속 문제
- 컨텐츠: 레이드, 던전, 퀘스트
- 운영소통: 개발사 대응, 공지, 커뮤니케이션
- PvP: 전장, 공성, PK
- UI편의성: 인터페이스, 편의 기능
- 기타

예시 (한국 MMO 커뮤니티 말투):
- "솔직히 내 아이템이 1달도 못간다고? 좆같잖아"
  → sentiment=negative, categories=[과금BM, 컨텐츠]

- "작업장 대응 관련 서버 생성 제한 조치 적용"
  → sentiment=neutral, categories=[운영소통, 서버기술]

- "글라디 버프 감사합니다 드디어 할만해짐"
  → sentiment=positive, categories=[클래스밸런스]

- "마도성 스킬 쿨다운 너무 길어요 너프 시급"
  → sentiment=negative, categories=[클래스밸런스]

- "3/11 서버 지연 후속 조치 성역 도전권 지급"
  → sentiment=neutral, categories=[서버기술, 운영소통]

JSON만 출력 (설명 금지):
{
  "sentiment": "positive|negative|neutral",
  "categories": ["카테고리1", ...],
  "issue_summary": "핵심 이슈 한 문장 (30자 이내)",
  "keywords": ["단어1", "단어2", "단어3"]
}

게시글:
제목: {title}
본문: {body}
"""
```
- Rate limit 처리 (Flash 무료 티어 15 RPM — 4초 간격 유지)
- 실패 시 재시도 (exponential backoff)

## Day 4~5 — 통합 + 스케줄링

### Task 8: 파이프라인 진입점 (`pipeline/scripts/run_pipeline.py`)
```python
def main():
    # 1. 수집
    new_posts = collect_reddit()
    saved = save_posts(new_posts)
    print(f"Saved {saved} new posts")

    # 2. 필터링 + 분류
    unclassified = fetch_unclassified(limit=100)
    for post in unclassified:
        if is_spam(post):
            mark_as_spam(post.id)
            continue
        result = classify(post)
        update_classification(post.id, result)

    # 3. 집계 갱신
    refresh_hourly_stats(hours=3)  # 최근 3시간만
```

### Task 9: cron 등록 (로컬 PC)
```bash
# 매 30분
*/30 * * * * cd /path/to/legion-homepage/pipeline && uv run python scripts/run_pipeline.py >> logs/pipeline.log 2>&1
```

### Task 10: 집계 테이블 갱신 로직 (`pipeline/src/aggregators/hourly.py`)
- 최근 3시간만 재계산 (효율)
- UPSERT: `INSERT ... ON CONFLICT (hour) DO UPDATE`

## Day 6~7 — 대시보드

### Task 11: API Route (`app/api/voice/now/route.ts`)
```typescript
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const { data } = await supabase
    .from('voice_hourly_stats')
    .select('*')
    .order('hour', { ascending: false })
    .limit(1)
    .single()

  return NextResponse.json(data)
}
```

### Task 12: 대시보드 페이지 (`app/반응/page.tsx`)
- Server Component에서 초기 데이터 fetch
- Client Component는 차트 렌더링
- 3개 섹션:
  1. 지금 상황 (최근 1시간 카드 3개)
  2. 추이 (Recharts 라인 차트)
  3. 최근 글 목록 (테이블)

### Task 13: README 업데이트
- 기존 길드 홈페이지 README에 "반응" 탭 섹션 추가
- `pipeline/README.md` 별도 작성 (파이프라인 실행법)

## 1주차 완료 체크리스트

- [ ] Supabase에 3개 테이블 존재
- [ ] `uv run python pipeline/scripts/run_pipeline.py` 성공
- [ ] **인벤 Aion 2** 자유게시판(6388)에서 최근 게시글이 `voice_raw_posts`에 쌓임
- [ ] LLM 분류 결과가 `sentiment`, `categories`, `issue_summary` 컬럼에 채워짐
- [ ] cron으로 30분마다 자동 실행됨
- [ ] `/반응` 페이지가 최근 1시간 여론을 표시함
- [ ] **게시글 원문이 대시보드에 노출되지 않음 확인** (저작권)
- [ ] Git 커밋 + push 완료
- [ ] 개발 일지 7일치 작성

## 개발 일지 템플릿 (`docs/journal/YYYY-MM-DD.md`)

```markdown
## YYYY-MM-DD Day N

### 오늘 한 일
-

### 내가 직접 결정한 것 + 근거
-

### Claude Code 도움 받은 것
-

### 막혔던 문제와 해결
-

### 내일 할 일
-

### 면접 스토리 메모
-
```

## 주의사항

1. **Supabase service role key는 절대 프론트에 노출 금지** — `pipeline/.env`에만.
2. **프론트에서는 anon key + RLS 정책으로만 접근**.
3. **Cloudflare Pages 빌드 설정**:
   - Build command: `npm run build`
   - Build output: `.next`
   - Root directory: `/` (pipeline 폴더는 빌드에 포함되지 않음)
4. **Gemini API 키 rate limit 주의** — 1분에 15회 호출 넘기지 말 것.
