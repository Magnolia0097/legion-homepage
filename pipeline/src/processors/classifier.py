"""Gemini Flash Tier-2 감성/카테고리 분류기.

is_spam() 통과 후 LLM 분류가 필요한 게시글에 적용.
API 오류·파싱 실패 시 None 반환 — 파이프라인 전체를 멈추지 않음.
"""

from __future__ import annotations

import json
import logging
import time
from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime, timezone

import httpx
from google import genai
from google.genai import types

from ..config import get_settings
from ..db import get_supabase
from ..retry import call_with_retry

logger = logging.getLogger(__name__)

VALID_SENTIMENTS: frozenset[str] = frozenset({"positive", "negative", "neutral"})
VALID_CATEGORIES: list[str] = [
    "클래스밸런스", "버그오류", "콘텐츠", "이벤트과금", "커뮤니티", "기타",
]


class LLMUnavailable(Exception):
    """이번 실행에서는 LLM을 더 쓸 수 없음 (인증 실패·모든 모델 쿼터 소진 등)."""


class QuotaExhausted(LLMUnavailable):
    """Gemini API 일일/분당 쿼터 소진 — 해당 배치 분류를 즉시 중단해야 함."""


# ── 호출 지표 (실행 요약·pipeline_runs·평가 리포트용) ─────────────────────────

@dataclass
class LLMStats:
    """실행 1회의 Gemini 호출 지표. 분류 동작에는 영향을 주지 않는 관측 전용."""

    requests: int = 0            # 실제 HTTP 요청 수 (재시도·폴백 모델 포함)
    retries: int = 0             # 일시적 오류로 같은 모델 재시도한 횟수
    ok: int = 0                  # 응답 JSON 파싱까지 성공
    latency_ms_total: float = 0  # 성공 요청의 지연 합계
    errors: Counter = field(default_factory=Counter)     # auth / quota / not_found / transient / parse / other
    fallbacks: Counter = field(default_factory=Counter)  # invalid_sentiment / category_filtered

    @property
    def error_total(self) -> int:
        return sum(self.errors.values())

    @property
    def avg_latency_ms(self) -> float | None:
        return self.latency_ms_total / self.ok if self.ok else None


llm_stats = LLMStats()


def reset_llm_stats() -> None:
    """실행 시작 시 호출 — 다른 모듈이 가진 참조가 유지되도록 제자리 초기화."""
    llm_stats.__init__()


_TRANSIENT_CODES = {408, 500, 502, 503, 504}


def _error_kind(exc: BaseException) -> str:
    """Gemini 호출 예외 분류. 404·429 판정은 기존 문자열 기준을 그대로 유지한다."""
    text = str(exc)
    code = getattr(exc, "code", None)
    if "404" in text or "NOT_FOUND" in text:
        return "not_found"
    if "429" in text or "RESOURCE_EXHAUSTED" in text:
        return "quota"
    if code in (401, 403) or "PERMISSION_DENIED" in text or "UNAUTHENTICATED" in text:
        return "auth"  # 예: 'Your API key was reported as leaked' (2026-07~)
    if (code in _TRANSIENT_CODES or isinstance(exc, (httpx.TimeoutException, httpx.TransportError))
            or "UNAVAILABLE" in text or "DEADLINE_EXCEEDED" in text):
        return "transient"
    return "other"


# 분류 모델 폴백 체인 — 앞에서부터 시도, 404(퇴역)·429(쿼터소진)면 다음 모델로.
# 무료 한도가 큰 모델을 앞에 배치. 한도는 모델별·프로젝트별로 따로 잡힌다.
# 2026-11 AI Studio 표기 (무료 등급): 3.5·3.1 flash-lite 15 RPM·500 RPD, 2.5 flash-lite 10 RPM·20 RPD.
_FALLBACK_MODELS: list[str] = [
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
    "gemini-2.5-flash-lite",
]

# 이번 실행에서 404/쿼터소진으로 사용 불가 판정된 모델 (호출 낭비 방지)
_dead_models: set[str] = set()


def _model_chain() -> list[str]:
    """설정 모델을 맨 앞에 두고 폴백 모델을 이어붙인 시도 순서 (dead 제외)."""
    settings = get_settings()
    chain: list[str] = [settings.gemini_model]
    for m in _FALLBACK_MODELS:
        if m not in chain:
            chain.append(m)
    return [m for m in chain if m not in _dead_models]


# {{ }} 로 중괄호 이스케이프 — .format()이 title/body만 치환
_PROMPT_TEMPLATE = """\
당신은 Aion 2(아이온2) 한국 게임 커뮤니티 게시글을 분석하는 전문가입니다.
제목만으로도 판단하세요 — 본문이 "(없음)"이면 제목의 어조와 단어만으로 감정을 결정합니다.

## 감정 분류 기준 (엄격히 적용)
- negative: 불만·비판·항의·탓·욕설·포기·환불·버그 신고·하향/너프 요구·게임사 비판
  예) "왜이러냐", "개같다", "망했다", "때문임", "탓이다", "ㅡㅡ", "최악", "접겠다", "환불", "짜증", "사기임", "답없다", "나락"
- positive: 칭찬·기쁨·성공·공략 공유·감사·상향 환영·이벤트 긍정
  예) "좋다", "최고", "드디어", "성공", "졸업", "완료", "감사", "추천"
- neutral: 질문·정보 요청·단순 공지·중립적 관찰 (불만/칭찬 없이 사실만 서술)

## 출력 형식 (JSON만, 다른 텍스트 없이)
{{
  "sentiment": "positive" | "negative" | "neutral",
  "categories": ["카테고리1"],
  "issue_summary": "한국어 1~2문장 요약",
  "keywords": ["키워드1", "키워드2"]
}}

카테고리 목록 (최대 3개): 클래스밸런스, 버그오류, 콘텐츠, 이벤트과금, 커뮤니티, 기타

--- 예시 1 (negative - 탓/비난) ---
제목: 이게다 운영진때문임 진짜
본문: (없음)
결과: {{"sentiment": "negative", "categories": ["커뮤니티"], "issue_summary": "운영진 탓으로 게임 문제를 돌리는 불만 글.", "keywords": ["운영진", "비난"]}}

--- 예시 2 (negative - 포기/접속) ---
제목: 싀벌꺼 접을란다
본문: (없음)
결과: {{"sentiment": "negative", "categories": ["기타"], "issue_summary": "게임에 대한 극도의 불만으로 게임 포기 선언.", "keywords": ["포기", "불만"]}}

--- 예시 3 (negative - 버그 비판) ---
제목: 마도성 스킬 쿨다운 버그 아직도 안 고쳐짐 언제 고쳐요
본문: 어제 패치 이후로 쿨다운이 표시랑 달라요
결과: {{"sentiment": "negative", "categories": ["버그오류", "클래스밸런스"], "issue_summary": "마도성 스킬 쿨다운 버그가 패치 후에도 지속되어 불만 제기.", "keywords": ["마도성", "쿨다운", "버그", "패치"]}}

--- 예시 4 (positive - 성공/공유) ---
제목: 아르카나 완료 ㅠㅠ 드디어 졸업합니다
본문: (없음)
결과: {{"sentiment": "positive", "categories": ["콘텐츠"], "issue_summary": "아르카나 콘텐츠 완료에 대한 성취감 표현.", "keywords": ["아르카나", "졸업", "완료"]}}

--- 예시 5 (positive - 공략 공유) ---
제목: 호법성 초보용 스킬 트리 추천해드립니다
본문: 저도 처음엔 어려웠는데 이렇게 찍으니 훨씬 편해요
결과: {{"sentiment": "positive", "categories": ["콘텐츠", "커뮤니티"], "issue_summary": "호법성 스킬 트리 공략 정보 공유.", "keywords": ["호법성", "스킬트리", "초보"]}}

--- 예시 6 (neutral - 질문) ---
제목: pvp 명중셋 회피셋 치명타 몇 나오시나요?
본문: (없음)
결과: {{"sentiment": "neutral", "categories": ["콘텐츠"], "issue_summary": "PVP 장비 세팅 치명타 수치 문의.", "keywords": ["pvp", "명중", "회피", "치명타"]}}

--- 분석 대상 ---
제목: {title}
본문: {body}
"""


# 응답이 오지 않을 때 무한 대기하지 않도록 요청 타임아웃 (google-genai 기본값은 제한 없음)
_HTTP_TIMEOUT_MS = 30_000


def _get_client() -> genai.Client:
    settings = get_settings()
    return genai.Client(
        api_key=settings.gemini_api_key,
        http_options=types.HttpOptions(timeout=_HTTP_TIMEOUT_MS),
    )


def _generate(client: genai.Client, model: str, prompt: str) -> str:
    """generate_content 1건 — 일시적 오류(5xx·타임아웃·연결)만 백오프 재시도.

    인증 실패·쿼터 소진·404는 재시도해도 같으므로 즉시 올려 보내 기존 폴백 로직이 처리한다.
    """

    def _once() -> str:
        llm_stats.requests += 1
        started = time.perf_counter()
        response = client.models.generate_content(
            model=model,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.3,
            ),
        )
        llm_stats.latency_ms_total += (time.perf_counter() - started) * 1000
        return response.text

    def _count_retry(*_args) -> None:
        llm_stats.retries += 1

    return call_with_retry(
        _once, is_retryable=lambda e: _error_kind(e) == "transient",
        attempts=3, base=2.0, cap=20.0, on_retry=_count_retry,
    )


def _log_fallback(post: dict, fallback_type: str, raw_value: str, model: str) -> None:
    """폴백 발생을 classification_fallback_log 테이블에 기록.

    측정 목적의 부가 로깅이므로 실패해도 분류 파이프라인은 계속 진행한다
    (update_classification과 동일한 방어적 패턴).
    """
    try:
        db = get_supabase(use_service_role=True)
        db.table("classification_fallback_log").insert({
            "post_id": post.get("id"),
            "title_prefix": ((post.get("title") or "").strip())[:60],
            "fallback_type": fallback_type,
            "raw_value": raw_value,
            "model": model,
        }).execute()
    except Exception as exc:
        logger.warning("폴백 로그 저장 실패 (type=%s): %s", fallback_type, exc)


def classify_post(post: dict) -> dict | None:
    """게시글 하나를 Gemini로 분류.

    Returns:
        {{"sentiment", "categories", "issue_summary", "keywords"}} 또는 None
    """
    title = (post.get("title") or "").strip()
    body = (post.get("body") or "").strip() or "(없음)"
    prompt = _PROMPT_TEMPLATE.format(title=title, body=body)

    chain = _model_chain()
    if not chain:
        raise QuotaExhausted("모든 후보 모델 사용 불가")

    client = _get_client()
    last_quota_exc: str | None = None

    for model in chain:
        try:
            result = json.loads(_generate(client, model, prompt))
        except Exception as exc:
            exc_str = str(exc)
            kind = "parse" if isinstance(exc, json.JSONDecodeError) else _error_kind(exc)
            llm_stats.errors[kind] += 1
            # 404=모델 퇴역/미지원, limit:0 또는 429=쿼터소진 → 이번 실행 동안 dead 처리 후 다음 모델
            if kind == "not_found":
                logger.warning("모델 %s 사용 불가(404) — 폴백", model)
                _dead_models.add(model)
                continue
            if kind == "quota":
                logger.warning("모델 %s 쿼터 소진 — 폴백", model)
                _dead_models.add(model)
                last_quota_exc = exc_str[:200]
                continue
            logger.warning("Gemini 분류 실패 (title=%r, model=%s, kind=%s): %s", title[:30], model, kind, exc)
            return None

        llm_stats.ok += 1
        # 분류 성공
        raw_sentiment = result.get("sentiment", "neutral")
        sentiment = raw_sentiment
        if sentiment not in VALID_SENTIMENTS:
            # neutral 폴백이 조용히 일어나면 원인 분석이 불가능 — 발동 빈도를 남긴다
            logger.warning(
                "유효하지 않은 sentiment %r → neutral 폴백 (title=%r, model=%s)",
                raw_sentiment, title[:30], model,
            )
            _log_fallback(post, "invalid_sentiment", str(raw_sentiment), model)
            llm_stats.fallbacks["invalid_sentiment"] += 1
            sentiment = "neutral"

        raw_cats = result.get("categories") or []
        categories = [c for c in raw_cats if c in VALID_CATEGORIES][:3] or ["기타"]
        dropped_cats = [c for c in raw_cats if c not in VALID_CATEGORIES]
        if dropped_cats:
            logger.warning(
                "유효하지 않은 카테고리 %d개 필터링 %r (title=%r, model=%s)",
                len(dropped_cats), dropped_cats, title[:30], model,
            )
            _log_fallback(
                post, "category_filtered",
                json.dumps(dropped_cats, ensure_ascii=False), model,
            )
            llm_stats.fallbacks["category_filtered"] += 1

        issue_summary = (result.get("issue_summary") or "").strip() or None
        keywords = [str(k) for k in (result.get("keywords") or [])][:5]

        return {
            "sentiment": sentiment,
            "categories": categories,
            "issue_summary": issue_summary,
            "keywords": keywords,
            "model": model,
        }

    # 체인의 모든 모델이 404/쿼터소진 → 배치 중단 신호
    raise QuotaExhausted(last_quota_exc or "모든 후보 모델 사용 불가")


# ── 묶음 분류 (batch 모드, 2026-11~ 기본) ───────────────────────────────────────────────
# 글 하나당 요청 1번이면 무료 한도(하루 수백 회)로 하루 수백~천 건을 다 못 본다. 제목만 보는 분류라
# 여러 글을 한 요청에 묶는다 (50건 기준 요청 1번 약 5초, 입력 2천·출력 3천 토큰).
# issue_summary에는 요약문 대신 여러 글이 공유하는 짧은 이슈 topic을 넣는다 — 대시보드
# '오늘의 주요 이슈 TOP 5'가 같은 문자열 빈도로 묶기 때문 (예전엔 제목이 그대로 들어가 전부 1회였다).

_BATCH_PROMPT = """\
당신은 아이왘2(AION 2) 한국 게임 커뮤니티(인벤 아이왘2 게시판) 게시글을 분류하는 분석가입니다.
아래 JSON 배열의 각 게시글(제목만 있음)을 읽고, 모든 항목에 대해 결과를 하나씩 반환하세요.
입력 필드: id, board(게시판: 자유 또는 직업명), tag(인벤 말머리: 일반/잡담/질문 등, 없을 수 있음), title(제목)

## sentiment (글쓴이의 감정·태도)
- negative: 불만, 비판, 항의, 조롱, 욕설, 분노, 실망, 포기·접음 선언, 너프·하향 요구, 운영진·개발사 비난,
  버그·오류 불만, 다른 유저 비난
  - 질문 형식이어도 불만·비꼼이 담기면 negative (예: "이걸 패치라고 한 거임?", "뭐가 좋다고 헤헤거림??")
  - 반어적 칭찬은 negative (예: "레전드 갓패치", "역시 게임 잘 만드네 ㅋㅋ")
- positive: 칭찬, 기쁨, 만족, 감사, 성공·클리어·득템 자랑, 기대감, 공략·팁 공유, 업데이트 환영
- neutral: 순수 질문, 정보 요청, 단순 정보·소식 전달, 감정이 드러나지 않는 잡담·관찰

## categories (최대 2개): 클래스밸런스, 버그오류, 콘텐츠, 이벤트과금, 커뮤니티, 기타

## topic: 이 글의 이슈를 "대상 + 쟁점" 형식의 짧은 명사구(2~3단어, 12자 이내)로 일반화
  - 구체적 수치·상황·닉네임·욕설은 빼고, 여러 글이 공유할 수 있게 넓게 묶으세요
  - 예: "정령성 밸런스", "성역 난이도", "비탄 보상", "패치 불만", "게임 이탈", "파티 매칭", "강화 확률",
    "서버 오류", "운영 불만", "PVP 밸런스", "직업 선택", "아이템 자랑"
  - 같은 이슈의 글에는 반드시 똑같은 topic 문자열을 쓰세요
{known_topics}
## keywords: 핵심 명사 최대 4개 (직업명, 콘텐츠명, 스킬·시스템명)

## 출력: JSON 배열만. 입력 순서대로, 모든 id 포함.

## 입력
{items}
"""

_BATCH_SCHEMA = {
    "type": "ARRAY",
    "items": {
        "type": "OBJECT",
        "properties": {
            "id": {"type": "INTEGER"},
            "sentiment": {"type": "STRING", "enum": sorted(VALID_SENTIMENTS)},
            "categories": {"type": "ARRAY", "items": {"type": "STRING", "enum": VALID_CATEGORIES}},
            "topic": {"type": "STRING"},
            "keywords": {"type": "ARRAY", "items": {"type": "STRING"}},
        },
        "required": ["id", "sentiment", "categories", "topic", "keywords"],
    },
}

_TOPIC_MAX_LEN = 30


def build_batch_prompt(posts: list[dict], known_topics: list[str] | None = None) -> str:
    """묶음 분류 프롬프트. id는 DB id 대신 1부터의 순번(출력 토큰 절약·매핑 단순화)."""
    items = [
        {
            "id": i,
            "board": p.get("board_name") or "",
            "tag": p.get("category_tag") or "",
            "title": (p.get("title") or "").strip()[:200],
        }
        for i, p in enumerate(posts, start=1)
    ]
    hint = ""
    if known_topics:
        hint = "  - 아래 기존 topic 중 맞는 것이 있으면 그대로 재사용: " + " / ".join(known_topics) + "\n"
    return _BATCH_PROMPT.format(known_topics=hint, items=json.dumps(items, ensure_ascii=False))


def _generate_batch(client: genai.Client, model: str, prompt: str) -> str:
    """묶음 분류 요청 1건 — 구조화 출력(JSON 스키마)으로 항목 누락·형식 오류를 줄인다."""

    def _once() -> str:
        llm_stats.requests += 1
        started = time.perf_counter()
        response = client.models.generate_content(
            model=model,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=_BATCH_SCHEMA,
                temperature=0.2,
            ),
        )
        llm_stats.latency_ms_total += (time.perf_counter() - started) * 1000
        return response.text

    def _count_retry(*_args) -> None:
        llm_stats.retries += 1

    return call_with_retry(
        _once, is_retryable=lambda e: _error_kind(e) == "transient",
        attempts=3, base=2.0, cap=20.0, on_retry=_count_retry,
    )


def _clean_batch_item(item: dict, post: dict, model: str) -> dict:
    """LLM 출력 1건 검증·정리 (classify_post와 같은 폴백 기록 규칙)."""
    title = (post.get("title") or "").strip()
    sentiment = item.get("sentiment")
    if sentiment not in VALID_SENTIMENTS:
        logger.warning("유효하지 않은 sentiment %r → neutral 폴백 (title=%r, model=%s)",
                       sentiment, title[:30], model)
        _log_fallback(post, "invalid_sentiment", str(sentiment), model)
        llm_stats.fallbacks["invalid_sentiment"] += 1
        sentiment = "neutral"

    raw_cats = item.get("categories") or []
    categories = [c for c in raw_cats if c in VALID_CATEGORIES][:3] or ["기타"]
    dropped = [c for c in raw_cats if c not in VALID_CATEGORIES]
    if dropped:
        _log_fallback(post, "category_filtered", json.dumps(dropped, ensure_ascii=False), model)
        llm_stats.fallbacks["category_filtered"] += 1

    topic = " ".join(str(item.get("topic") or "").split())[:_TOPIC_MAX_LEN] or None
    keywords = [str(k).strip() for k in (item.get("keywords") or []) if str(k).strip()][:5]
    return {
        "sentiment": sentiment,
        "categories": categories,
        "issue_summary": topic,
        "keywords": keywords,
        "model": model,
    }


def classify_batch(posts: list[dict], known_topics: list[str] | None = None) -> dict[int, dict]:
    """여러 글을 Gemini 요청 1번으로 분류.

    Returns:
        {post id: 분류 결과}. 응답에서 빠진 글은 들어 있지 않다(다음 실행에서 재시도).
        일시 오류가 재시도 끝에도 안 풀리면 빈 dict.

    Raises:
        LLMUnavailable: 인증 실패 — 이번 실행에서 LLM을 더 부르지 말 것
        QuotaExhausted: 후보 모델 전부 404·쿼터 소진
    """
    if not posts:
        return {}
    chain = _model_chain()
    if not chain:
        raise QuotaExhausted("모든 후보 모델 사용 불가")

    prompt = build_batch_prompt(posts, known_topics)
    client = _get_client()
    last_quota_exc: str | None = None

    for model in chain:
        try:
            data = json.loads(_generate_batch(client, model, prompt))
        except Exception as exc:
            kind = "parse" if isinstance(exc, json.JSONDecodeError) else _error_kind(exc)
            llm_stats.errors[kind] += 1
            if kind in ("not_found", "quota"):
                logger.warning("모델 %s 사용 불가(%s) — 다음 모델로", model, kind)
                _dead_models.add(model)
                if kind == "quota":
                    last_quota_exc = str(exc)[:200]
                continue
            if kind == "auth":
                raise LLMUnavailable(f"Gemini 인증 실패: {str(exc)[:200]}") from exc
            if kind == "parse":
                logger.warning("묶음 응답 JSON 파싱 실패 (model=%s) — 다음 모델로", model)
                continue
            logger.warning("Gemini 묶음 분류 실패 (model=%s, kind=%s): %s", model, kind, exc)
            return {}

        llm_stats.ok += 1
        items = data if isinstance(data, list) else (data.get("results") or [])
        results: dict[int, dict] = {}
        for item in items:
            if not isinstance(item, dict):
                continue
            try:
                idx = int(item.get("id"))
            except (TypeError, ValueError):
                continue
            if 1 <= idx <= len(posts):
                post = posts[idx - 1]
                results[post["id"]] = _clean_batch_item(item, post, model)
        missing = len(posts) - len(results)
        if missing:
            logger.warning("묶음 응답에서 %d건 누락 (model=%s) — 다음 실행에서 재시도", missing, model)
        return results

    raise QuotaExhausted(last_quota_exc or "모든 후보 모델 사용 불가")


def bulk_update_classifications(posts: list[dict], results: dict[int, dict]) -> int:
    """분류 결과를 요청 1번에 저장. 저장한 건수를 돌려준다 (실패 시 0).

    Actions 러너(미국)와 DB(서울) 사이 왕복이 길어 글마다 UPDATE하면 수천 건에 수 분이 걸린다.
    PostgREST upsert(ON CONFLICT (id) DO UPDATE)로 묶는데, INSERT 단계의 NOT NULL 검사를
    통과하도록 식별 컨럼(source, external_id, posted_at)을 같이 보낸다 (값은 그대로라 변경 없음).
    """
    now = datetime.now(tz=timezone.utc).isoformat()
    payload = []
    for post in posts:
        result = results.get(post["id"])
        if not result:
            continue
        payload.append({
            "id": post["id"],
            "source": post["source"],
            "external_id": post["external_id"],
            "posted_at": post["posted_at"],
            "sentiment": result["sentiment"],
            "categories": result["categories"],
            "issue_summary": result["issue_summary"],
            "keywords": result["keywords"],
            "classified_by_model": result.get("model"),
            "classified_at": now,
        })
    if not payload:
        return 0
    db = get_supabase(use_service_role=True)
    try:
        db.table("voice_raw_posts").upsert(payload, on_conflict="id").execute()
        return len(payload)
    except Exception as exc:
        logger.error("분류 결과 일괄 저장 실패 (%d건): %s", len(payload), exc)
        return 0


def update_classification(post_id: int, result: dict) -> bool:
    """voice_raw_posts에 분류 결과 업데이트."""
    db = get_supabase(use_service_role=True)
    try:
        db.table("voice_raw_posts").update({
            "sentiment": result["sentiment"],
            "categories": result["categories"],
            "issue_summary": result["issue_summary"],
            "keywords": result["keywords"],
            "classified_by_model": result.get("model"),
            "classified_at": datetime.now(tz=timezone.utc).isoformat(),
        }).eq("id", post_id).execute()
        return True
    except Exception as exc:
        logger.error("분류 결과 저장 실패 (id=%s): %s", post_id, exc)
        return False


def classify_unclassified(limit: int = 50) -> int:
    """미분류 게시글을 일괄 분류하고 DB 업데이트.

    Returns:
        성공적으로 분류된 게시글 수
    """
    db = get_supabase(use_service_role=True)
    try:
        rows = (
            db.table("voice_raw_posts")
            .select("id, title, body")
            .is_("classified_at", "null")
            .limit(limit)
            .execute()
        ).data
    except Exception as exc:
        logger.error("미분류 게시글 조회 실패: %s", exc)
        return 0

    success = 0
    for row in rows:
        result = classify_post(row)
        if result and update_classification(row["id"], result):
            success += 1

    logger.info("Gemini 분류 완료: %d/%d건", success, len(rows))
    return success
