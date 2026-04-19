# Claude Code 활용 가이드

## 기본 원칙

> **설계 결정은 본인이, 구현 세부는 AI 도움 받아도 OK.**
>
> 면접관은 "AI 썼냐"를 안 물어본다. "왜 이 선택을 했냐"를 묻는다.
> 설계 근거는 `docs/decisions/` ADR로 남기면 된다.

## AI에게 맡겨도 되는 것

- 보일러플레이트 (pyproject.toml, tsconfig, 기본 폴더 구조)
- CRUD 쿼리 작성
- 타입 힌트, docstring, 테스트 스켈레톤
- README 초안
- 에러 메시지 해석
- 코드 리뷰 ("내가 쓴 코드 어때?")
- 리팩토링 제안

## 직접 해야 할 것

### 1. 설계 결정과 근거
- 왜 Supabase인가? (DBA 경력 + JSONB)
- 왜 cron인가? (v1 완주 우선, v2에서 Airflow)
- 왜 3-tier 필터링인가? (LLM 비용 절약)
- **→ `docs/decisions/`에 ADR로 기록**

### 2. 핵심 비즈니스 로직
- LLM 프롬프트 설계 (카테고리, few-shot)
- 필터 규칙 정의
- 이상 탐지 임계값

### 3. 디버깅 첫 30분
- 에러 나면 로그부터 본인이 읽기
- 가설 세우고 나서 Claude Code에게
- "이 에러는 X가 원인일 거 같은데 맞아?"

### 4. 쿼리 튜닝 (DBA 강점)
- EXPLAIN ANALYZE 직접 읽기
- 인덱스 설계 본인이 결정
- Supabase 대시보드에서 Slow query 모니터링

## 프롬프트 템플릿

### 프로젝트 초기화
> `docs/PROJECT.md`와 `docs/WEEK1_TASKS.md`를 읽어.
> Task 1 (폴더 구조 생성)을 진행해줘.
> 기존 파일을 훼손하지 않도록 주의하고, 모호하면 먼저 물어봐.

### Task 구현
> Task 5 (Reddit 수집기) 구현해줘.
> 다만 praw 사용법은 내가 공식 문서 확인하고 싶으니,
> 뼈대 + 타입만 먼저 만들어주고 API 호출 부분은 TODO 주석으로 남겨.

### 코드 리뷰
> `pipeline/src/processors/classifier.py` 리뷰해줘.
> 특히:
> - Rate limit 처리가 제대로 되었는지
> - 재시도 로직에 exponential backoff 적용되었는지
> - 프롬프트 실패 시 어떻게 동작하는지

### 디버깅
> [에러 로그 붙여넣기]
> 내 추측: Supabase RLS 정책 때문에 INSERT가 거부되는 것 같은데,
> service role key가 제대로 로드되는지 확인 필요.
> 이 방향 맞나?

### 설계 논의
> Task 10에서 집계 테이블을 어떻게 갱신할지 고민 중이야.
> 옵션 A는 전체 재계산, 옵션 B는 최근 N시간만 재계산.
> 장단점과 내가 고려 못한 옵션 있으면 알려줘. 결정은 내가 할게.

## 개발 일지 템플릿 (`docs/journal/YYYY-MM-DD.md`)

```markdown
## 2026-04-20 Day 1

### 오늘 한 일
- Supabase 프로젝트 생성
- `voice_raw_posts` 테이블 스키마 작성
- RLS 정책 추가

### 내가 직접 결정한 것 + 근거
- 테이블 접두어 `voice_`: 기존 길드 홈페이지 테이블과 네이밍 충돌 회피
- `external_id` 길이 200: Reddit ID(10자)+ 인벤 URL 경로(100+) 고려
- 부분 인덱스 `WHERE classified_at IS NULL`: 미분류 조회 쿼리 최적화
  (DBA 때 배운 부분 인덱스 활용)

### Claude Code 도움
- pyproject.toml 작성 (uv 의존성 목록)
- RLS 정책 SQL 문법 확인

### 막혔던 문제
- Supabase CLI 설치 오류 → npm 글로벌 권한 문제. `sudo` 대신
  `npm prefix -g` 변경으로 해결.

### 내일 할 일
- Task 3: TypeScript 타입 생성
- Task 4: pipeline 폴더 구조

### 면접 스토리 메모
- "테이블 네이밍에 접두어 두어 다중 도메인 공존 대비"
- "부분 인덱스로 미분류 큐 조회 성능 확보 — DBA 경력 활용"
```

## 금지 사항

1. **에러 보자마자 복붙해서 "고쳐줘"** — 30분은 본인이 씨름
2. **"전체 구현해줘"** — Task 단위로 쪼개서
3. **설계 결정 AI에게 맡기기** — 옵션 비교는 도움 받되, 선택은 본인
4. **ADR 없이 큰 결정 내리기** — 나중에 면접에서 근거 설명 못 함
5. **테스트 없이 다음 Task** — 작게라도 검증

## 면접 대비: 설명 방식 예시

### 나쁜 답
> "Supabase 썼어요. Claude가 추천해줘서요."

### 좋은 답
> "DBA로 Oracle/MariaDB 3년간 다뤄왔고 관계형 DB 강점을 포트폴리오에서도
> 살리고 싶었습니다. LLM 분류 결과의 가변 구조를 JSONB로 유연하게 담을
> 수 있다는 점, 그리고 무료 티어 500MB로 예상 사용량의 16배 여유가
> 있다는 점도 고려했습니다. 이 의사결정 과정은 ADR로 기록해뒀습니다."

이 차이가 **"AI 시대의 주니어"와 "AI를 도구로 쓰는 주니어"의 차이**입니다.
