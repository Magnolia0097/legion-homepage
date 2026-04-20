# pipeline

Python 데이터 파이프라인 — Aion 2 커뮤니티 여론 수집 · 분류 · 집계.

## 설치

```bash
# uv 설치 (미설치 시)
curl -LsSf https://astral.sh/uv/install.sh | sh

# 의존성 설치
cd pipeline
uv sync
```

## 환경변수 설정

```bash
cp .env.example .env
# .env 파일을 열어 API 키 입력
```

필요한 키:
- `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` — Supabase 대시보드 → Project Settings → API
- `GEMINI_API_KEY` — [Google AI Studio](https://aistudio.google.com/)
- `INVEN_USER_AGENT` — 연락처 이메일 포함 문자열로 수정

## 실행

> Task 5~10 구현 후 사용 가능

```bash
uv run python scripts/run_pipeline.py
```

## cron 등록 (로컬 PC)

```bash
# 매 30분 자동 실행
*/30 * * * * cd /path/to/legion-homepage/pipeline && uv run python scripts/run_pipeline.py >> logs/pipeline.log 2>&1
```

## 구조

```
pipeline/
├── pyproject.toml        # 의존성 (uv)
├── .env.example          # 환경변수 템플릿
├── .python-version       # Python 3.11
├── src/
│   ├── config.py         # 환경변수 → Settings 객체
│   ├── db.py             # Supabase 클라이언트 싱글톤
│   ├── collectors/       # 소스별 수집기 (인벤 등)
│   ├── processors/       # 스팸 필터 + Gemini 분류기
│   └── aggregators/      # 시간별·일별 집계
├── scripts/
│   └── run_pipeline.py   # 파이프라인 진입점
└── tests/
```

## 주의사항

- `.env` 파일은 절대 커밋 금지 (`.gitignore` 등록됨)
- `SUPABASE_SERVICE_ROLE_KEY`는 파이프라인 내부에서만 사용
- 인벤 요청 간격 `INVEN_REQUEST_INTERVAL` 은 3.0 미만으로 낮추지 말 것
