# pipeline

Python 데이터 파이프라인 — Aion 2 커뮤니티 여론 수집 · 분류 · 집계.

## 빠른 시작

```bash
cp .env.example .env   # API 키 입력
uv sync
uv run python scripts/run_pipeline.py
```

## 구조

```
pipeline/
├── src/
│   ├── collectors/   # 소스별 수집기 (Reddit, 인벤, …)
│   ├── processors/   # 필터 + Gemini 분류기
│   └── aggregators/  # 시간별·일별 집계
├── scripts/
│   └── run_pipeline.py
└── tests/
```

## 환경변수

`.env.example` 참고. 실제 `.env`는 절대 커밋하지 말 것.
