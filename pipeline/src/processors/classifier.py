"""Gemini Flash Tier-2 감성/카테고리 분류기.

is_spam() 통과 후 LLM 분류가 필요한 게시글에 적용.
API 오류·파싱 실패 시 None 반환 — 파이프라인 전체를 멈추지 않음.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone

from google import genai
from google.genai import types

from ..config import get_settings
from ..db import get_supabase

logger = logging.getLogger(__name__)

VALID_SENTIMENTS: frozenset[str] = frozenset({"positive", "negative", "neutral"})
VALID_CATEGORIES: list[str] = [
    "클래스밸런스", "버그오류", "콘텐츠", "이벤트과금", "커뮤니티", "기타",
]

# {{ }} 로 중괄호 이스케이프 — .format()이 title/body만 치환
_PROMPT_TEMPLATE = """\
당신은 Aion 2(아이온2) 게임 커뮤니티 게시글을 분석하는 전문가입니다.
아래 게시글을 읽고 JSON 형식으로 분석 결과를 반환하세요.

출력 형식:
{{
  "sentiment": "positive" | "negative" | "neutral",
  "categories": ["카테고리1"],
  "issue_summary": "한국어 1~2문장 요약",
  "keywords": ["키워드1", "키워드2"]
}}

카테고리 목록 (최대 3개 선택): 클래스밸런스, 버그오류, 콘텐츠, 이벤트과금, 커뮤니티, 기타

--- 예시 1 ---
제목: 글라디에이터 상향 패치 드디어 나왔네요 너무 좋아요
본문: (없음)
결과: {{"sentiment": "positive", "categories": ["클래스밸런스"], "issue_summary": "글라디에이터 상향 패치에 대한 긍정적 반응.", "keywords": ["글라디에이터", "상향", "패치"]}}

--- 예시 2 ---
제목: 마도성 스킬 쿨다운 버그 아직도 안 고쳐짐 언제 고쳐요
본문: 어제 패치 이후로 쿨다운이 표시랑 달라요
결과: {{"sentiment": "negative", "categories": ["버그오류", "클래스밸런스"], "issue_summary": "마도성 스킬 쿨다운 버그가 패치 후에도 지속되어 불만 제기.", "keywords": ["마도성", "쿨다운", "버그", "패치"]}}

--- 예시 3 ---
제목: 이번 여름 이벤트 보상 너무 짜다 솔직히
본문: (없음)
결과: {{"sentiment": "negative", "categories": ["이벤트과금"], "issue_summary": "여름 이벤트 보상이 불만족스럽다는 의견.", "keywords": ["이벤트", "보상"]}}

--- 예시 4 ---
제목: 호법성 초보용 스킬 트리 추천해드립니다
본문: 저도 처음엔 어려웠는데 이렇게 찍으니 훨씬 편해요
결과: {{"sentiment": "positive", "categories": ["콘텐츠", "커뮤니티"], "issue_summary": "호법성 스킬 트리 공략 정보 공유.", "keywords": ["호법성", "스킬트리", "초보"]}}

--- 분석 대상 ---
제목: {title}
본문: {body}
"""


def _get_client() -> genai.Client:
    settings = get_settings()
    return genai.Client(api_key=settings.gemini_api_key)


def classify_post(post: dict) -> dict | None:
    """게시글 하나를 Gemini로 분류.

    Returns:
        {{"sentiment", "categories", "issue_summary", "keywords"}} 또는 None
    """
    title = (post.get("title") or "").strip()
    body = (post.get("body") or "").strip() or "(없음)"
    prompt = _PROMPT_TEMPLATE.format(title=title, body=body)

    try:
        client = _get_client()
        settings = get_settings()
        response = client.models.generate_content(
            model=settings.gemini_model,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.1,
            ),
        )
        result = json.loads(response.text)
    except Exception as exc:
        logger.warning("Gemini 분류 실패 (title=%r): %s", title[:30], exc)
        return None

    sentiment = result.get("sentiment", "neutral")
    if sentiment not in VALID_SENTIMENTS:
        sentiment = "neutral"

    raw_cats = result.get("categories") or []
    categories = [c for c in raw_cats if c in VALID_CATEGORIES][:3] or ["기타"]

    issue_summary = (result.get("issue_summary") or "").strip() or None
    keywords = [str(k) for k in (result.get("keywords") or [])][:5]

    return {
        "sentiment": sentiment,
        "categories": categories,
        "issue_summary": issue_summary,
        "keywords": keywords,
    }


def update_classification(post_id: int, result: dict) -> bool:
    """voice_raw_posts에 분류 결과 업데이트."""
    db = get_supabase(use_service_role=True)
    try:
        db.table("voice_raw_posts").update({
            "sentiment": result["sentiment"],
            "categories": result["categories"],
            "issue_summary": result["issue_summary"],
            "keywords": result["keywords"],
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
