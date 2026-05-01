# 07 — 파이프라인 오케스트레이터 설계

## What (무엇인가)

`pipeline/scripts/run_pipeline.py`는 수집 → 필터 → 분류 전 과정을 순서대로 실행하는
**메인 진입점**이다. cron으로 30분마다 호출되어 자동으로 여론 데이터를 수집·분류한다.

---

## Why (왜 이렇게 설계했나)

### 단순 스크립트로 시작 (ADR 003)

Airflow, Prefect 같은 워크플로우 엔진 대신 **단순 Python 스크립트 + cron**으로 시작했다.
이유:
- 비용 $0 (cron은 로컬 PC에 내장)
- 학습 곡선 없음 — 나중에 Airflow로 마이그레이션할 때도 로직 그대로 이식 가능
- 현재 데이터 볼륨(30분당 20~30건)에 오버엔지니어링 금지

v2에서 트래픽이 늘면 Prefect/Airflow로 전환 예정.

### Graceful Degradation (단계별 실패 격리)

수집이 실패해도 이전에 수집된 미분류 게시글은 분류 단계가 처리한다:

```python
try:
    collected = collect_inven_aion2(...)
    saved = save_posts(collected)
except Exception as exc:
    logger.error("수집 단계 실패: %s", exc)
    # 실패해도 다음 단계(미분류 처리) 계속 진행
```

각 게시글의 분류 실패도 전체를 멈추지 않는다.
`classify_post()`가 `None`을 반환하면 `failed_count`만 증가하고 다음 게시글로 넘어간다.

### Rate Limit 대응 (4초 sleep)

Gemini Flash 무료 티어는 **15 RPM** (분당 15회).
1회당 최소 60/15 = 4초 간격이 필요하다.

```python
_CLASSIFY_SLEEP = 4.0

update_classification(post_id, result)
classified_count += 1
time.sleep(_CLASSIFY_SLEEP)  # rate limit 초과 방지 — 제거 금지
```

> ⚠️ 이 sleep을 제거하면 429 Too Many Requests가 발생하고,
> 반복 위반 시 API 키 차단 가능성이 있다.

---

## How (어떻게 동작하나)

### 데이터 흐름

```
[cron 30분]
    │
    ▼
run_pipeline.main()
    │
    ├─ 1. 수집 단계
    │       collect_inven_aion2(board_id=6388, max_pages=1)
    │         └─ 인벤 HTTP 요청 (3초 간격)
    │         └─ parse_post_list() → list[dict]
    │       save_posts(collected)
    │         └─ Supabase UPSERT (ON CONFLICT DO NOTHING)
    │         └─ 반환: 신규 저장 건수
    │
    ├─ 2. 미분류 조회
    │       fetch_unclassified(limit=50)
    │         └─ SELECT WHERE classified_at IS NULL ORDER BY posted_at ASC
    │
    └─ 3. for post in unclassified:
            │
            ├─ is_spam(post)?   YES → mark_as_spam(post_id)
            │                         → sentiment='spam', classified_at=NOW()
            │
            └─ classify_post(post)
                    └─ Gemini API 호출
                    └─ JSON 파싱 + 유효성 검증
               update_classification(post_id, result)
                    └─ UPDATE sentiment, categories, issue_summary, keywords, classified_at
               time.sleep(4.0)
```

### 왜 classify_unclassified() 대신 직접 루프?

`classifier.py`에 이미 `classify_unclassified()` 함수가 있다.
하지만 `run_pipeline.py`에서는 **필터(is_spam) 단계를 먼저** 적용해야 하므로
직접 루프를 작성했다:

```
classifier.classify_unclassified(): fetch → classify → update (필터 없음)
run_pipeline.main():                fetch → is_spam? → classify → update (필터 포함)
```

### DB 헬퍼 함수 (db.py 추가)

| 함수 | 역할 |
|------|------|
| `fetch_unclassified(limit)` | `classified_at IS NULL` 게시글 오래된 순으로 N건 |
| `mark_as_spam(post_id)` | `sentiment='spam'`, `classified_at=NOW()` 업데이트 |

스팸은 `classified_at`을 채워 다음 배치에서 재처리되지 않도록 한다.

---

## sys.path 주의사항

`scripts/run_pipeline.py`는 `src/` 패키지 밖에 있어서 실행 방법에 따라
`ModuleNotFoundError`가 발생할 수 있다.

해결: 스크립트 상단에서 파이프라인 루트를 `sys.path`에 추가:

```python
sys.path.insert(0, str(Path(__file__).parent.parent))
```

`uv run python scripts/run_pipeline.py`로 실행하면 자동으로 처리된다.

---

## 실행 방법

```bash
# 즉시 실행
cd /path/to/legion-homepage/pipeline
uv run python scripts/run_pipeline.py

# cron 등록 (30분마다, logs/ 디렉토리 미리 생성 필요)
*/30 * * * * cd /path/to/legion-homepage/pipeline && uv run python scripts/run_pipeline.py >> logs/pipeline.log 2>&1
```

---

## 테스트 전략

6개 mock 기반 통합 테스트 (`tests/test_run_pipeline.py`):

| 테스트 | 검증 내용 |
|--------|-----------|
| `test_happy_path` | 정상 흐름: collect→save→fetch→classify×2, sleep×2 |
| `test_all_spam` | 전체 스팸: mark_as_spam×2, classify 미호출 |
| `test_collect_raises_continues` | 수집 예외 → fetch 여전히 호출 (graceful degradation) |
| `test_classify_returns_none_counted_as_failed` | None 반환 → update·sleep 미호출 |
| `test_no_unclassified_posts` | 미분류 없음 → 루프 실행 안 함 |
| `test_mixed_spam_and_valid` | 스팸 1 + 정상 1 혼합 흐름 검증 |

---

## 관련 파일

- `pipeline/scripts/run_pipeline.py` — 구현
- `pipeline/tests/test_run_pipeline.py` — 6개 통합 테스트
- `pipeline/src/db.py` — `fetch_unclassified`, `mark_as_spam` 추가
- `pipeline/src/collectors/inven.py` — 수집 (Task 5)
- `pipeline/src/processors/filter.py` — Tier-1 필터 (Task 6)
- `pipeline/src/processors/classifier.py` — Tier-2 LLM 분류 (Task 7)

---

## 다음 학습

- `08-cron-setup.md` — cron 등록 방법 (Task 9 완료 후)
- `09-hourly-aggregator.md` — 시간별 집계 로직 (Task 10 완료 후)
