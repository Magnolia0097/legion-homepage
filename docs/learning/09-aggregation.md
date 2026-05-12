# 09 — 집계 테이블 설계

## What (무엇인가)

`pipeline/src/aggregators/hourly.py`는 `voice_raw_posts`의 분류된 데이터를
시간별·일별로 집계해서 `voice_hourly_stats` / `voice_daily_stats`에 저장하는 모듈.

대시보드가 매번 GROUP BY 하는 대신 미리 계산된 집계 결과를 읽도록 최적화.

---

## Why (왜 이렇게 설계했나)

### 집계 테이블의 필요성

| 방식 | 대시보드 쿼리 | 데이터 10만 건 시 |
|------|-------------|-----------------|
| 매번 GROUP BY | `SELECT sentiment, COUNT(*) FROM voice_raw_posts GROUP BY...` | 수초 걸림 |
| 집계 테이블 | `SELECT * FROM voice_hourly_stats WHERE hour = '...'` | 즉시 |

관련 ADR: [001 (Supabase)](../001-supabase-database.md), [003 (미니배치)](../003-mini-batch-scheduling.md)

### 증분 업데이트 전략

전체 재계산 대신 **최근 N시간/N일만** 재계산:

```python
refresh_hourly_stats(hours_back=3)  # 최근 3시간만 재계산
refresh_daily_stats(days_back=2)    # 최근 2일만 재계산
```

이유: 오래된 데이터는 변하지 않으므로 매번 재계산하는 건 낭비.

### 클라이언트 사이드 집계

PostgreSQL의 `jsonb_array_elements_text` + `GROUP BY` SQL 대신
**Python에서 집계** 후 UPSERT하는 방식을 선택했다.

이유:
- Supabase 무료 티어에서 복잡한 SQL 함수 실행 제한 없이 동작
- 코드 디버깅/테스트가 SQL 함수보다 쉬움
- 데이터 볼륨(수백~수천 건)에서 성능 차이 미미

---

## How (어떻게 동작하나)

### 데이터 흐름

```
voice_raw_posts (classified_at IS NOT NULL)
    │
    ├─ SELECT: id, sentiment, categories, keywords, posted_at
    │
    ├─ Python 그룹핑 (시간별/일별 버킷)
    │
    ├─ _aggregate_posts() 호출 (버킷별)
    │       → total_count, sentiment 카운트
    │       → categories: {"클래스밸런스": 5, "버그오류": 2}
    │       → top_keywords: [{"keyword": "글라디", "count": 8}]
    │
    └─ UPSERT voice_hourly_stats / voice_daily_stats
           ON CONFLICT (hour/day) DO UPDATE
```

### _aggregate_posts() 내부 로직

```python
def _aggregate_posts(posts: list[dict]) -> dict:
    # 1. sentiment 카운트
    sentiment_counts = {"positive": 0, "negative": 0, "neutral": 0}
    for post in posts:
        if post["sentiment"] in sentiment_counts:
            sentiment_counts[post["sentiment"]] += 1

    # 2. categories 배열을 풀어서 카운트
    #    [{"categories": ["클래스밸런스", "버그오류"]}, ...]
    #    → {"클래스밸런스": N, "버그오류": M}
    for post in posts:
        for cat in (post["categories"] or []):
            category_counts[cat] += 1

    # 3. keywords 빈도 TOP 10
    top_keywords = sorted(keyword_counts.items(), key=lambda x: x[1], reverse=True)[:10]
```

### UPSERT 패턴 (충돌 처리)

```python
db.table("voice_hourly_stats").upsert(
    rows, on_conflict="hour"  # hour 컬럼이 PK
).execute()
```

- 해당 hour가 없으면 INSERT
- 있으면 UPDATE (재계산된 값으로 덮어씌움)

---

## daily_stats 추가 필드: top_issues

일별 집계에만 있는 `top_issues` — 당일 가장 많이 언급된 이슈 TOP 5:

```python
# issue_summary 빈도 TOP 5
issue_counts = {}
for post in posts:
    if summary := post.get("issue_summary"):
        issue_counts[summary] = issue_counts.get(summary, 0) + 1
top_issues = sorted(issue_counts.items(), key=lambda x: x[1], reverse=True)[:5]
```

출력: `[{"summary": "글라디에이터 버프 요청.", "count": 12}, ...]`

---

## 테스트 전략 (10개 테스트)

| 테스트 | 검증 내용 |
|--------|-----------|
| `test_aggregate_counts_sentiments` | positive/negative/neutral 카운트 |
| `test_aggregate_categories_jsonb` | 배열 풀어서 카운트 변환 |
| `test_aggregate_top_keywords_sorted` | 빈도 내림차순 정렬 |
| `test_aggregate_top_keywords_capped_at_10` | 최대 10개 제한 |
| `test_aggregate_empty_posts` | 빈 목록 처리 |
| `test_hourly_upserts_buckets` | 2개 시간대 → 2행 UPSERT |
| `test_hourly_returns_zero_on_empty` | 데이터 없음 → UPSERT 안 함 |
| `test_hourly_returns_zero_on_db_error` | DB 오류 시 0 반환 |
| `test_daily_includes_top_issues` | issue_summary 빈도 집계 |
| `test_daily_returns_zero_on_empty` | 일별 데이터 없음 처리 |

---

## 주의사항

- `classified_at IS NULL` 행 제외 — 아직 분류 안 된 글은 집계에서 빠짐
- `spam` sentiment는 카운트에서 자동 제외됨 (sentiment_counts에 spam 키 없음)
- KST/UTC 일관성: `voice_raw_posts.posted_at`이 `TIMESTAMPTZ`라 UTC로 저장됨. 시간대 버킷도 UTC 기준. 대시보드에서 KST로 변환 필요
- `hours_back` 너무 크면 Supabase 무료 티어 행 제한 초과 가능 (500만 행 한도)

---

## 관련 파일

- `pipeline/src/aggregators/hourly.py` — 구현
- `pipeline/tests/test_aggregators.py` — 10개 단위 테스트
- `pipeline/scripts/run_pipeline.py` — 집계 단계 통합 위치

---

## 다음 학습

- `10-frontend-dashboard.md` — Next.js 대시보드 구현 (Task 11~13 이후)
