# 04 — 인벤 크롤러 설계

## What (무엇인가)

`pipeline/src/collectors/inven.py`는 인벤 Aion 2 자유게시판(6388)에서
최근 게시글 메타데이터를 수집해 Supabase `voice_raw_posts`에 저장하는 모듈.

ETL 파이프라인에서 **Extract(수집)** 단계에 해당한다.

---

## Why (왜 이렇게 설계했나)

### Reddit 대신 인벤을 선택한 이유
2025년 11월 Reddit이 셀프 서비스 API 등록을 중단(Responsible Builder Policy)했다.
인벤은 한국 Aion 2 커뮤니티의 실질적 여론 창구이기도 하다.
→ 자세한 결정 배경: [ADR 004](../decisions/004-data-source-pivot.md)

### 함수를 세 개로 분리한 이유

```
collect_inven_aion2()   ← HTTP 요청 (네트워크 I/O)
      │
      ▼
parse_post_list()       ← HTML 파싱 (순수 함수, 테스트 쉬움)
      │
      ▼
save_posts()            ← DB 저장 (Supabase)
```

- **`parse_post_list`를 분리**: 인벤 HTML 구조가 바뀌면 이 함수만 수정하면 된다.
  나머지 두 함수는 변경 불필요.
- **`save_posts`를 분리**: 수집만 테스트하고 싶을 때 저장 없이 실행 가능.

### requests.Session을 모듈 레벨 싱글톤으로 관리하는 이유

`requests.Session()`은 내부적으로 커넥션 풀을 유지한다.
매번 새로 만들면 TCP 핸드셰이크 비용이 발생한다.
모듈 레벨 `_session`으로 프로세스 내내 재사용한다.

---

## How (어떻게 동작하나)

### 전체 흐름

```
[cron or 수동 실행]
        │
        ▼
collect_inven_aion2(board_id=6388, max_pages=1, sleep_seconds=3.0)
        │
        ├─ 1. robots.txt 체크 (수집 시작 시 1회)
        │     /board/aion2/* → 허용 확인됨
        │
        ├─ 2. GET https://www.inven.co.kr/board/aion2/6388
        │     timeout=10, User-Agent=config.inven_user_agent
        │
        ├─ 3. parse_post_list(html, 6388)
        │     BeautifulSoup + lxml 파서
        │     → [{source, external_id, url, title, author, posted_at, body}, ...]
        │
        ├─ 4. time.sleep(3.0)  ← 다음 페이지 있을 때만
        │
        └─ 5. save_posts(posts)
              upsert(on_conflict="source,external_id", ignore_duplicates=True)
              → INSERT 성공 건수 반환
```

### src/config.py와의 연동

```python
from ..config import get_settings

settings = get_settings()
session.headers["User-Agent"] = settings.inven_user_agent
# INVEN_USER_AGENT=legion-voice-tracker/0.1 (aion2-community-sentiment; ...)
```

`get_settings()`는 `@lru_cache`로 싱글톤이므로, 설정은 프로세스 시작 시 1회 로드된다.

### robots.txt 체크 코드

```python
from urllib.robotparser import RobotFileParser

rp = RobotFileParser()
rp.set_url("https://www.inven.co.kr/robots.txt")
rp.read()

if not rp.can_fetch(USER_AGENT, target_url):
    logger.warning(f"robots.txt 차단: {target_url}")
    return []
```

표준 라이브러리(`urllib.robotparser`)를 사용하므로 추가 의존성 없음.
robots.txt 읽기 자체가 실패해도 수집을 막지 않는다 (허용으로 간주).

### HTML 파싱 전략 (⚠️ 셀렉터 미확인)

```python
soup = BeautifulSoup(html, "lxml")  # lxml은 html.parser보다 2~3배 빠름

# 1차 시도: ul.list-body > li.li-row
rows = soup.select("ul.list-body > li.li-row")

# 실패 시 폴백: table.board-list tbody tr
if not rows:
    rows = soup.select("table.board-list tbody tr")
```

**현재 상태**: 실제 인벤 HTML을 확인하지 않고 추정 작성.
`test_inven.py` 실행 결과가 0건이면 이 셀렉터를 수정해야 한다.

### 날짜 파싱

인벤은 게시글 날짜를 다음 세 가지 형식으로 표시한다 (추정):

| 표시 | 의미 | 정규식 패턴 |
|------|------|-------------|
| `2026.04.21 12:30` | 연도 포함 전체 날짜 | `\d{4}\.\d{2}\.\d{2}\s+\d{2}:\d{2}` |
| `04.21 12:30` | 올해 글 (연도 생략) | `\d{2}\.\d{2}\s+\d{2}:\d{2}` |
| `12:30` | 오늘 글 (날짜 생략) | `\d{2}:\d{2}$` |

모든 경우 KST(+09:00)로 변환해 저장한다. Supabase는 TIMESTAMPTZ를 UTC로 저장하고
클라이언트에서 로컬 타임존으로 변환한다.

### 중복 방지 설계

```python
db.table("voice_raw_posts").upsert(
    posts,
    on_conflict="source,external_id",
    ignore_duplicates=True   # → ON CONFLICT DO NOTHING
).execute()
```

**왜 DB 레벨로 처리하나?**
- 애플리케이션 레벨(select 후 없으면 insert)은 동시 실행 시 race condition 발생 가능
- DB의 UNIQUE 제약 + upsert는 원자적으로 처리됨
- 코드가 단순해짐 (insert만 시도, 충돌은 DB가 처리)
- 기존 분류 결과(`sentiment`, `categories`)를 덮어쓰지 않음

---

## 데이터 흐름 예시 (실제 데이터 예상)

**입력**: 인벤 자유게시판 1페이지 HTML

**parse_post_list 출력**:
```python
[
    {
        "source": "inven_aion2",
        "external_id": "6388_9876543",
        "url": "https://www.inven.co.kr/board/aion2/6388/9876543",
        "title": "글라디 너프 진짜 너무한거 아님?",
        "author": "성심당마스터",
        "posted_at": "2026-04-21T14:30:00+09:00",
        "body": None,
    },
    # ... 약 20~30건
]
```

**save_posts 결과**:
- 첫 실행: 20~30건 신규 INSERT
- 재실행: 0건 (모두 중복으로 스킵)

---

## 주의사항 및 흔한 실수

### 반드시 지켜야 할 것

**1. `time.sleep(sleep_seconds)` 절대 제거 금지**
제거하면 수십 개의 요청이 1초 내에 전송되어 IP 차단이 즉각 발생한다.
테스트할 때도 최소 3초 유지.

**2. User-Agent에 연락처 포함**
```
INVEN_USER_AGENT=legion-voice-tracker/0.1 (aion2-community-sentiment; contact: [이메일])
```
인벤 운영팀이 과도한 요청을 감지했을 때 연락처를 보고 문의할 수 있다.
익명 UA는 즉시 차단 대상이 되기 쉽다.

**3. 원문을 대시보드에 노출하지 말 것**
`title`, `body` 컬럼은 DB 내부용. 대시보드 API(`/api/voice/*`)에서는
LLM이 생성한 `issue_summary`만 반환해야 한다.

### 자주 발생하는 문제

| 증상 | 원인 | 해결 |
|------|------|------|
| 수집 0건 | 셀렉터 불일치 | F12로 실제 HTML 확인 후 `parse_post_list` 수정 |
| HTTP 403 | User-Agent 차단 | `.env`의 `INVEN_USER_AGENT` 확인, 연락처 포함 여부 확인 |
| HTTP 429 | 요청 빈도 과다 | `sleep_seconds` 늘리기 (5~10초) |
| 날짜 파싱 실패 | 날짜 형식 추정 오류 | `_parse_posted_at`에 실제 형식 추가 |
| DB 저장 실패 | `.env` 미설정 또는 SQL 미실행 | Supabase 설정 확인 |

---

## 관련 외부 자료

- [requests 공식 문서](https://docs.python-requests.org/)
- [BeautifulSoup 공식 문서](https://www.crummy.com/software/BeautifulSoup/bs4/doc/)
- [robots.txt 표준 RFC 9309](https://www.rfc-editor.org/rfc/rfc9309)
- [supabase-py upsert 문서](https://supabase.com/docs/reference/python/upsert)

---

## 다음 학습

- [05-llm-classification.md](05-llm-classification.md) — Gemini 감성 분류 (Task 7 완료 후 작성)
