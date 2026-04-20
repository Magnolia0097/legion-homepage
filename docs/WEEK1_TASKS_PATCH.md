# WEEK1_TASKS.md 업데이트 패치 (Reddit → 인벤 변경사항)

> 이 파일은 WEEK1_TASKS.md에 적용할 변경사항만 모아둔 패치.
> Claude Code에게 이 문서 기반으로 기존 WEEK1_TASKS.md 수정을 시킬 것.

## Prerequisites 수정

**기존:**
```
- [ ] Reddit 개발자 앱 등록 → client_id, secret 확보
```

**변경:**
```
- [ ] Reddit 개발자 앱 등록 → 보류 (ADR 004 참조, 현재 셀프 서비스 중단됨)
- [ ] 인벤 Aion 2 게시판 구조 수동 탐색 (1회)
  - aion2.inven.co.kr 메인
  - 게시판 ID 목록: 6388(자유), 6444(팁), 6447(서버) 등
  - robots.txt 확인: https://www.inven.co.kr/robots.txt
```

## Task 4 수정 (pyproject.toml 의존성)

**제거**: `praw`
**유지**: `beautifulsoup4`, `requests`
**추가 (선택)**: `lxml` (BS4 파서, 속도 향상)

## Task 5 전면 교체: 인벤 크롤러 구현

### 기존 Task 5
> Reddit 수집기 구현 (`praw` 사용)

### 신규 Task 5: 인벤 Aion 2 크롤러 구현

**파일**: `pipeline/src/collectors/inven.py`

**목적**: 인벤 Aion 2 자유 게시판(6388)의 최근 게시글 + 댓글 수집

**구현 요구사항:**

1. **요청 매너 엄수**
   - User-Agent: `legion-voice-tracker/0.1 (aion2-community-sentiment; contact: [주찬님 이메일])`
   - 요청 간격: `time.sleep(3)` 최소 3초
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
   - 이미 수집한 글은 `(source='inven_aion2', external_id)` UNIQUE로 스킵
   - 댓글은 일단 제외 (v2에서 추가)

4. **파싱 대상 (목록 페이지)**
   - 게시글 URL: `/board/aion2/6388/{post_id}` 패턴
   - 제목
   - 작성자
   - 작성일시
   - 댓글 수

5. **파싱 대상 (상세 페이지) — 선택적**
   - 본문 텍스트 (태그 제거, 공백 정리)
   - v1 MVP에서는 **목록 페이지 정보만** 사용해도 충분
   - 상세 페이지 수집은 v1.1에서 추가

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
    "external_id": f"6388_{post_id}",  # 게시판 + 글 ID
    "url": f"https://www.inven.co.kr/board/aion2/6388/{post_id}",
    "title": "...",
    "body": None,  # v1은 목록만, v1.1에서 채움
    "author": "...",
    "posted_at": datetime,  # ISO 8601
}
```

**테스트 체크:**
- 1페이지 수집 시 20~30건 가져오는지
- 중복 실행 시 추가 insert 0건인지
- robots.txt 차단 시나리오에서 crash 없이 스킵되는지

**⚠️ 주의사항:**
- `time.sleep(3)` 빼먹으면 IP 차단 가능 — 절대 제거 금지
- HTML 구조는 예고 없이 변경될 수 있으므로 파싱 함수를 모듈화
- 본문/제목을 외부에 그대로 노출하지 않음 (ADR 004 참조)

## Task 7 수정: Gemini 분류기 — 한국어 최적화

### Few-shot 프롬프트 변경

**기존 (영어 섞임):**
```python
PROMPT = """다음 게시글의 감성을 분류하세요.

예시:
- "이번 패치 개발자 뭐하냐" → negative
- "글라디 버프 감사합니다!" → positive
...
"""
```

**변경 (한국어 + Aion 2 맥락 강화):**
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

**정확도 높이는 팁:**
- 예시에 **실제 인벤에서 본 말투** 포함 (욕설, 줄임말, 반말)
- 예시에 **모호한 케이스**도 포함 (중립, 멀티 카테고리)
- `response_mime_type="application/json"` 옵션 사용 (Gemini JSON 강제)

### 모델 선택 변경

**기존:** `gemini-2.5-flash-lite`
**변경:** `gemini-2.5-flash` (Flash-Lite보다 정확도 ↑, 무료 티어 250 RPD로 충분)

근거:
- Flash-Lite 1,000 RPD지만 한국어 복잡 분류에서 성능 떨어질 우려
- Flash 250 RPD면 하루 250건 분류 가능 (3-tier 필터 통과한 애매한 것만 보내면 충분)
- 필요 시 Flash-Lite로 돌아가거나 Pro(100 RPD)로 올리는 유연성 유지

## 환경변수 (`.env.example`) 수정

**제거:**
```
REDDIT_CLIENT_ID=
REDDIT_CLIENT_SECRET=
REDDIT_USER_AGENT=
```

**추가:**
```
# 인벤 크롤러
INVEN_USER_AGENT=legion-voice-tracker/0.1 (aion2-community-sentiment; contact: [이메일])
INVEN_REQUEST_INTERVAL=3.0
INVEN_BOARD_IDS=6388,6444,6447  # 자유, 팁, 서버

# Gemini API (기존)
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash

# Supabase (기존)
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

## DB 스키마 수정 (`supabase/migrations/001_voice_tracker.sql`)

기존 스키마 대부분 유지. `source` VARCHAR 크기만 확인:

**기존:**
```sql
source VARCHAR(20) NOT NULL,  -- 'reddit', 'inven', 'dcinside'
```

**변경:**
```sql
source VARCHAR(30) NOT NULL,  -- 'inven_aion2', 'dcinside_aion', 'youtube_xxx' 등
```

이유: `inven_aion2`, `dcinside_aion2` 등 세분화된 식별자 사용 (향후 소스 추가 시 구분 용이).

## 1주차 완료 체크리스트 수정

- [ ] Supabase에 3개 테이블 존재
- [ ] `uv run python pipeline/scripts/run_pipeline.py` 성공
- [ ] **인벤 Aion 2** 자유게시판(6388)에서 최근 게시글이 `voice_raw_posts`에 쌓임
- [ ] LLM 분류 결과가 `sentiment`, `categories`, `issue_summary` 컬럼에 채워짐
- [ ] cron으로 30분마다 자동 실행됨
- [ ] `/반응` 페이지가 최근 1시간 여론을 표시함
- [ ] **게시글 원문이 대시보드에 노출되지 않음 확인** (저작권)
- [ ] Git 커밋 + push 완료

## Claude Code에 전달할 프롬프트

```
docs/decisions/004-data-source-pivot.md 읽어줘.
그리고 docs/WEEK1_TASKS_PATCH.md에 기록된 변경사항을 WEEK1_TASKS.md에 반영해줘.

구체적으로:
1. Prerequisites 섹션 수정
2. Task 4의 의존성 목록에서 praw 제거
3. Task 5 전면 교체 (Reddit → 인벤)
4. Task 7의 프롬프트 템플릿 한국어 강화 버전으로 교체
5. 환경변수 목록 수정
6. DB 스키마의 source 컬럼 크기 수정
7. 1주차 완료 체크리스트 수정

변경 후 diff 보여주고, 머지 전에 내가 확인할 수 있게 해줘.
기존 WEEK1_TASKS.md 전체 구조는 유지하고 필요한 부분만 수정.
```
