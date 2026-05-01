# 05 — 정규식 스팸 필터 설계

## What (무엇인가)

`pipeline/src/processors/filter.py`는 LLM(Gemini) 호출 전에 명확한 스팸·광고 게시글을
정규식으로 걸러내는 **Tier-1 필터**.

비용 $0으로 Gemini 무료 호출 횟수(250 RPD)를 최대한 절약하는 것이 목적이다.

---

## Why (왜 이렇게 설계했나)

### 3-Tier 필터 전략

```
[Tier-1] 정규식 필터 (filter.py)  ← 이번 Task
    │  비용 0원, 명확한 스팸 즉시 제거
    ▼
[Tier-2] LLM 분류 (Gemini Flash)  ← Task 7
    │  250 RPD 무료, 애매한 글 감성 분류
    ▼
[Tier-3] 대시보드 표시
```

Tier-1에서 제거되면 Gemini API를 아예 호출하지 않는다.
실제 광고글 비율이 10~30%라면 매일 25~75건의 API 호출을 절약한다.

### FILTER_RULES 딕셔너리 구조를 선택한 이유

```python
FILTER_RULES: dict[str, re.Pattern | None] = {
    "ad_url_sale": re.compile(...),
    "ad_contact":  re.compile(...),
    ...
}
```

- **확장성**: 새 패턴 추가 = 딕셔너리에 항목 한 줄 추가. 함수 로직 수정 불필요.
- **로깅**: 키 이름이 어떤 규칙에 걸렸는지 식별자 역할을 한다 (추후 logging 추가 시).
- **단일 루프**: `for rule_name, pattern in FILTER_RULES.items()` 로 모든 패턴 검사.

### 제목 + 본문 합산 검사

```python
text = f"{title} {body}".strip()
# 패턴 검사는 text(합산)에 적용
```

광고 URL이 본문에만 있어도 잡힌다.
단, 제목 길이 체크는 `title`만 본다 (본문 길이는 스팸 판단 기준 아님).

---

## How (어떻게 동작하나)

### 필터 규칙 상세

| 규칙 키 | 패턴 | 잡는 대상 |
|---------|------|-----------|
| `ad_url_sale` | `(https?://\|www\.)\S+.{0,50}(판매\|문의\|할인...)` | URL + 판매 키워드 |
| `ad_contact` | `(카카오\|카톡\|...) ... [:：] \S+` | 카카오 ID 광고 |
| `ad_phone` | `0\d{1,2}[-\s]?\d{3,4}[-\s]?\d{4}` | 전화번호 포함 |
| `repeat_chars` | `(.)\1{4,}` | 같은 문자 5회+ 연속 |
| `emoji_only` | `^[^\w가-힣a-zA-Z0-9]+$` | 이모지·특수문자만 |

### 결정 흐름

```
is_spam(post)
    │
    ├─ len(title) < 15 → True (스팸)
    │
    ├─ for each FILTER_RULES pattern:
    │     pattern.search(title + " " + body) 매칭 → True (스팸)
    │
    └─ 모두 통과 → False (정상)
```

### MIN_TITLE_LENGTH = 15 기준

- 의미 있는 문장의 최소 길이 실험적 설정
- "ㅋㅋㅋ", "ㅈㄴ어렵" 같은 무의미한 단편 글 제거
- 15자 미만 = 약 7~8음절 = 정상적인 글 제목으로 짧음

---

## 테스트 설계 원칙

### 경계값 테스트 (Boundary Value Analysis)

```python
# 정확히 15자 → 통과
post = {"title": "열다섯글자제목테스트용입니다요"}  # len == 15
assert is_spam(post) is False

# 정확히 14자 → 스팸
post = {"title": "열네글자의제목이테스트입니다"}  # len == 14
assert is_spam(post) is True
```

OFF-BY-ONE 버그를 잡기 위해 경계 ±1 모두 검사.

### 실제 게임 커뮤니티 말투 사용

```python
# 스팸 아님 예시 — 실제 Aion 2 커뮤니티 말투 모방
{"title": "마도성 스킬 쿨다운 너무 길어요 진짜"},
{"title": "글라디에이터 버프 감사합니다 드디어 쓸만해짐"},
```

임의의 "lorem ipsum" 대신 실제 도메인 단어를 사용해
필터가 게임 용어를 스팸으로 오탐하지 않음을 검증한다.

### 발견한 버그: 한국어 문자열 길이 주석 불일치

```python
# 작성 시 주석에 "15자"라고 썼지만 실제 len() == 14
"열다섯글자제목테스트용입니다"   # 14자 (주석 오류)
"열다섯글자제목테스트용입니다요"  # 15자 (수정 후)
```

Python `len()`은 한국어 글자 수를 정확히 셈 (유니코드 코드포인트 기준).
주석으로 글자 수를 명시할 때는 실제로 `len()`을 세어볼 것.

---

## 확장 방법

새로운 스팸 패턴 발견 시:

```python
# FILTER_RULES 딕셔너리에 항목 추가만 하면 됨
FILTER_RULES["ad_new_pattern"] = re.compile(r"새로운 패턴")
```

`is_spam()` 함수 코드 수정 불필요. 테스트는 `test_spam_posts`에 케이스 추가.

---

## 관련 파일

- `pipeline/src/processors/filter.py` — 구현
- `pipeline/tests/test_filter.py` — 22개 단위 테스트
- `docs/learning/06-llm-classification.md` — Task 7 완료 후 작성 예정

---

## 다음 학습

- [06-llm-classification.md](06-llm-classification.md) — Gemini 감성 분류 (Task 7 완료 후)
