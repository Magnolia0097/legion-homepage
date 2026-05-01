# 06 — Gemini LLM 감성 분류기 설계

## What (무엇인가)

`pipeline/src/processors/classifier.py`는 정규식 필터(Tier-1)를 통과한 게시글을
Gemini 2.5 Flash로 감성·카테고리 분류하는 **Tier-2 분류기**.

분류 결과는 `voice_raw_posts` 테이블의 `sentiment`, `categories`, `issue_summary`,
`keywords`, `classified_at` 컬럼에 저장된다.

---

## Why (왜 이렇게 설계했나)

### google-genai vs google-generativeai

작업 중 `google-generativeai` 패키지가 deprecated 경고를 출력했다.

```
FutureWarning: All support for the `google.generativeai` package has ended.
Please switch to the `google.genai` package.
```

→ 즉시 `google-genai` (새 SDK)로 마이그레이션.

| 구분 | 구 SDK (`google.generativeai`) | 신 SDK (`google.genai`) |
|------|-------------------------------|------------------------|
| 패키지 | `google-generativeai` | `google-genai` |
| 클라이언트 | `genai.GenerativeModel(model)` | `genai.Client(api_key=...)` |
| 호출 | `model.generate_content(prompt)` | `client.models.generate_content(model=..., contents=...)` |
| 설정 | `genai.configure(api_key=...)` | `Client(api_key=...)` 생성자에서 직접 |

### API 오류 시 None 반환 (파이프라인 방어)

```python
except Exception as exc:
    logger.warning("Gemini 분류 실패 (title=%r): %s", title[:30], exc)
    return None
```

Gemini가 실패해도 파이프라인이 멈추면 안 된다.
`classify_unclassified()`는 `None`을 건너뛰고 다음 게시글로 진행한다.
실패한 게시글은 `classified_at IS NULL`로 남아 다음 배치에서 재시도된다.

### few-shot 프롬프트 (4개 예시)

```
긍정 (positive) × 1  — 클래스밸런스 카테고리
부정 (negative) × 2  — 버그오류+클래스밸런스, 이벤트과금
긍정 (positive) × 1  — 콘텐츠+커뮤니티 (공략 글)
```

실제 Aion 2 커뮤니티 말투를 반영해 모델이 게임 도메인 어휘를 올바르게 해석하도록 유도.

---

## How (어떻게 동작하나)

### 분류 흐름

```
classify_unclassified(limit=50)
        │
        ├─ 1. Supabase: SELECT id, title, body WHERE classified_at IS NULL LIMIT 50
        │
        ├─ 2. for each row:
        │       classify_post(row)
        │           ├─ 프롬프트 구성 (title + body)
        │           ├─ Gemini API 호출 (response_mime_type="application/json")
        │           ├─ JSON 파싱
        │           └─ 유효성 검증 → {sentiment, categories, issue_summary, keywords}
        │
        └─ 3. update_classification(id, result)
                Supabase UPDATE SET sentiment=..., classified_at=NOW()
```

### 유효성 검증 레이어

Gemini 출력이 명세를 벗어날 때 방어:

```python
# sentiment 교정
if sentiment not in VALID_SENTIMENTS:
    sentiment = "neutral"          # 알 수 없는 값 → neutral

# categories 교정
categories = [c for c in raw_cats if c in VALID_CATEGORIES][:3]
if not categories:
    categories = ["기타"]          # 유효한 카테고리 없으면 기타

# keywords 제한
keywords = [str(k) for k in (result.get("keywords") or [])][:5]
```

### Python f-string / .format() 함정

프롬프트에 JSON 예시를 넣을 때 `{}` 가 `.format()` 플레이스홀더와 충돌한다.

```python
# 잘못된 예 — KeyError: '\n  "sentiment"'
prompt = """출력 형식: {"sentiment": ...}""".format(title=title)

# 올바른 예 — {{ }} 로 이스케이프
prompt = """출력 형식: {{"sentiment": ...}}""".format(title=title)
```

**교훈**: `.format()` 을 쓰는 문자열에 `{`, `}` 가 있으면 모두 `{{`, `}}` 로 바꾼다.
대안으로 f-string + 변수 조립, 또는 `string.Template` ($치환) 을 사용할 수도 있다.

---

## 카테고리 설계

| 카테고리 | 대상 |
|---------|------|
| 클래스밸런스 | 직업 강/약, 상향/하향 패치 반응 |
| 버그오류 | 게임 버그, UI 오류, 서버 장애 |
| 콘텐츠 | 던전, 레이드, 퀘스트 관련 |
| 이벤트과금 | 이벤트 보상, 캐시샵, 과금 구조 |
| 커뮤니티 | 길드, 유저 관계, 공략 공유 |
| 기타 | 위 분류에 해당하지 않는 글 |

---

## 테스트 전략

### Mock 사용 이유

실제 Gemini API를 테스트마다 호출하면:
- 무료 250 RPD 소모
- 네트워크 필요 (CI/CD 환경 불가)
- 응답 불결정성 → 테스트 flaky

→ `unittest.mock.patch("src.processors.classifier._get_client")` 로 클라이언트만 mock.
  응답 JSON을 직접 지정해 각 시나리오를 결정론적으로 검증.

### 검증 항목 (12개 테스트)

| 테스트 | 검증 내용 |
|--------|-----------|
| 정상 분류 3개 | positive/negative/neutral 각 1개 |
| sentiment 교정 | 유효하지 않은 값 → neutral |
| categories 교정 | 유효하지 않은 카테고리 → 기타 |
| categories 최대 3개 | 4개 이상 반환 시 잘라냄 |
| keywords 최대 5개 | 7개 이상 반환 시 잘라냄 |
| API 오류 → None | Exception 발생 시 None 반환 |
| JSON 파싱 실패 → None | 유효하지 않은 JSON → None |
| 빈 summary → None | 빈 문자열 → None 변환 |
| 상수 검증 2개 | VALID_SENTIMENTS, VALID_CATEGORIES |

---

## 관련 파일

- `pipeline/src/processors/classifier.py` — 구현
- `pipeline/tests/test_classifier.py` — 12개 단위 테스트 (mock)
- `pipeline/src/processors/filter.py` — Tier-1 (이 분류기 전 단계)
- `docs/learning/05-filter-design.md` — Tier-1 설계 문서

---

## 다음 학습

- `07-pipeline-orchestration.md` — `run_pipeline.py` 오케스트레이션 (Task 8 완료 후)
