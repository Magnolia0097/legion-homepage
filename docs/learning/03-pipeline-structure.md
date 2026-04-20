# 03 — Python 파이프라인 구조

## What (무엇인가)

`pipeline/` 폴더는 Aion 2 커뮤니티 여론을 수집·분류·집계하는 Python 배치 프로그램이다.
Next.js 앱(frontend/)과는 완전히 독립된 프로세스로, 30분마다 cron으로 실행된다.

**하는 일 요약:**
1. 인벤 게시판에서 최근 게시글 수집
2. 스팸 필터링 후 Gemini로 감성·카테고리 분류
3. 집계 테이블(hourly/daily) 갱신
4. 프론트엔드는 Supabase에서 집계 결과만 읽음

---

## Why (왜 이렇게 설계했나)

### 레이어 분리 (collector / processor / aggregator)

세 가지 역할을 폴더로 명확히 구분했다.

| 레이어 | 폴더 | 역할 |
|--------|------|------|
| 수집 | `src/collectors/` | 외부 소스에서 원본 데이터 가져오기 |
| 처리 | `src/processors/` | 필터링 + LLM 분류 |
| 집계 | `src/aggregators/` | 시간별·일별 통계 계산 |

이렇게 나누면 "인벤 HTML 구조가 바뀌었을 때" collector만 수정하면 된다.
processor나 aggregator는 변경 없이 재사용 가능.

### pydantic-settings로 타입 안전한 설정 관리

환경변수를 `os.getenv("KEY")`로 직접 읽으면 오타나 누락을 런타임에서야 발견한다.
`pydantic-settings`는 `.env` 파일을 읽어 타입 검증까지 해주므로,
`GEMINI_API_KEY` 누락 시 프로세스 시작 시점에 바로 에러를 낸다.

### DB 클라이언트 싱글톤

Supabase 클라이언트를 호출마다 생성하면 커넥션 오버헤드가 생긴다.
`lru_cache`로 캐싱해서 프로세스 내에서 한 번만 생성·재사용한다.

관련 ADR:
- [ADR 001 — Supabase 채택](../decisions/001-supabase-database.md)
- [ADR 002 — Monorepo 구조](../decisions/002-monorepo-structure.md)
- [ADR 003 — 미니배치 스케줄링](../decisions/003-mini-batch-scheduling.md)

---

## How (어떻게 동작하나)

### 디렉토리 구조

```
pipeline/
├── pyproject.toml        # 의존성 선언 (uv 사용)
├── .env.example          # 환경변수 템플릿 (실제 .env는 gitignore)
├── .python-version       # "3.11" — uv가 자동으로 Python 버전 맞춤
├── src/
│   ├── __init__.py
│   ├── config.py         # 환경변수 → 타입 안전한 Settings 객체
│   ├── db.py             # Supabase 클라이언트 싱글톤
│   ├── collectors/       # 소스별 수집기 (현재: inven.py 예정)
│   ├── processors/       # filter.py (스팸), classifier.py (Gemini)
│   └── aggregators/      # hourly.py (시간별 집계)
├── scripts/
│   └── run_pipeline.py   # 진입점: collect → process → aggregate 순서 실행
└── tests/
    └── test_filter.py    # 필터 로직 단위 테스트
```

### src/config.py — 환경변수 관리

```python
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    # SettingsConfigDict: .env 파일을 자동 로드, 없는 변수는 무시
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # 기본값 있는 필드 → 옵션 (없어도 실행됨)
    inven_user_agent: str = "legion-voice-tracker/0.1"
    inven_request_interval: float = 3.0
    gemini_model: str = "gemini-2.5-flash"

    # 기본값 없는 필드 → 필수 (없으면 시작 시 ValidationError)
    gemini_api_key: str
    supabase_url: str
    supabase_anon_key: str
    supabase_service_role_key: str

    @property
    def board_id_list(self) -> list[int]:
        # "6388,6444,6447" → [6388, 6444, 6447]
        return [int(b.strip()) for b in self.inven_board_ids.split(",")]

@lru_cache          # 프로세스 내에서 Settings 객체를 한 번만 생성
def get_settings() -> Settings:
    return Settings()
```

**사용 방법:**
```python
from src.config import get_settings

settings = get_settings()
print(settings.gemini_model)       # "gemini-2.5-flash"
print(settings.board_id_list)      # [6388, 6444, 6447]
```

### src/db.py — Supabase 클라이언트 싱글톤

```python
from functools import lru_cache
from supabase import Client, create_client
from .config import get_settings

@lru_cache
def _get_client(use_service_role: bool) -> Client:
    settings = get_settings()
    key = settings.supabase_service_role_key if use_service_role else settings.supabase_anon_key
    return create_client(settings.supabase_url, key)

def get_supabase(use_service_role: bool = False) -> Client:
    return _get_client(use_service_role)
```

**anon key vs service_role key:**

| | anon key | service_role key |
|---|---|---|
| RLS 적용 | O (정책 적용) | X (우회) |
| 읽기 | 공개 정책이면 가능 | 항상 가능 |
| 쓰기 | 차단 (정책 없음) | 항상 가능 |
| 사용처 | 프론트엔드 | 파이프라인만 |

```python
# 읽기 전용 (기본)
db = get_supabase()
data = db.table("voice_hourly_stats").select("*").execute()

# 쓰기 (INSERT/UPDATE) — 파이프라인 내부에서만
db = get_supabase(use_service_role=True)
db.table("voice_raw_posts").insert({...}).execute()
```

---

## 데이터 흐름 예시

```
[cron 30분마다 실행]
        │
        ▼
scripts/run_pipeline.py
        │
        ├─ 1. collect_inven_aion2()          ← collectors/inven.py
        │     인벤 자유게시판 1페이지 크롤링
        │     → [{source, external_id, title, posted_at, ...}, ...]
        │
        ├─ 2. save_posts(posts)              ← collectors/inven.py
        │     Supabase voice_raw_posts에 INSERT (중복 스킵)
        │     → saved_count: int
        │
        ├─ 3. fetch_unclassified(limit=100)  ← db.py
        │     classified_at IS NULL 게시글 조회 (부분 인덱스 활용)
        │
        ├─ 4. for post in unclassified:
        │       is_spam(post) → True면 스킵   ← processors/filter.py
        │       classify(post) → {sentiment, categories, ...}
        │                                      ← processors/classifier.py
        │       update_classification(post.id, result)
        │
        └─ 5. refresh_hourly_stats(hours=3)  ← aggregators/hourly.py
              최근 3시간 집계 재계산 → UPSERT voice_hourly_stats
```

---

## 주의사항 및 흔한 실수

**1. `.env` 파일을 커밋하면 안 된다**
`.gitignore`에 `pipeline/.env`가 등록되어 있지만, `git add -A` 실행 시 실수로
포함될 수 있다. 커밋 전 `git status`로 확인 필수.

**2. service_role key를 프론트에 노출하면 안 된다**
`SUPABASE_SERVICE_ROLE_KEY`는 RLS를 완전히 무시한다. 브라우저에 노출되면
누구나 DB를 읽고 쓸 수 있다. 반드시 `pipeline/.env`에만 존재해야 한다.

**3. lru_cache는 프로세스 재시작 전까지 캐시를 유지한다**
`.env` 파일을 수정해도 현재 실행 중인 프로세스에는 반영되지 않는다.
`uv run python scripts/run_pipeline.py`를 새로 실행해야 한다.

**4. `pydantic-settings`는 `pydantic`과 별도 패키지다**
`pyproject.toml`에 `pydantic-settings>=2.3`이 명시되어 있어야 한다.
`pydantic`만 설치하면 `from pydantic_settings import BaseSettings` 에서 ImportError.

---

## 관련 외부 자료

- [pydantic-settings 공식 문서](https://docs.pydantic.dev/latest/concepts/pydantic_settings/)
- [supabase-py 공식 문서](https://supabase.com/docs/reference/python/introduction)
- [uv 패키지 매니저 공식 문서](https://docs.astral.sh/uv/)
- [Supabase RLS 가이드](https://supabase.com/docs/guides/database/postgres/row-level-security)

---

## 다음 학습

- [04-crawler-design.md](04-crawler-design.md) — 인벤 크롤링 설계 (Task 5 완료 후 작성)
