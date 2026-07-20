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
│   ├── run_pipeline.py       # 파이프라인 진입점
│   ├── backup.py             # 테이블 CSV 백업
│   ├── sample_for_audit.py   # 분류 감사용 sentiment별 50건 샘플 추출 (측정 Phase 2)
│   ├── eval_classifier.py    # 라벨링된 샘플로 confusion matrix·정확도 산출 (측정 Phase 3)
│   └── fallback_summary.py   # 폴백/카테고리 필터링 비율 요약 리포트 (측정 Phase 4)
└── tests/
```

## 분류 품질 측정 워크플로

모델 재구축 여부를 정하기 전 원인 진단용 (자세한 배경은 측정 가이드 참조):

1. `supabase/migrations/002_classification_audit.sql` 적용 → 폴백 로그·`classified_by_model` 기록 시작
2. `uv run python scripts/sample_for_audit.py` → `audit_sample_YYYYMMDD.csv` 150건 추출
3. CSV의 `label_actual` 컬럼을 사람이 직접 라벨링
4. `uv run python scripts/eval_classifier.py audit_sample_YYYYMMDD.csv`
   → 저장된 분류 정확도 + `classify_hybrid` vs `classify_hybrid_v2_experimental` 비교
5. 1주일 운영 후 `uv run python scripts/fallback_summary.py` → 폴백 비율 리포트

## 주의사항

- `.env` 파일은 절대 커밋 금지 (`.gitignore` 등록됨)
- `SUPABASE_SERVICE_ROLE_KEY`는 파이프라인 내부에서만 사용
- 인벤 요청 간격 `INVEN_REQUEST_INTERVAL` 은 3.0 미만으로 낮추지 말 것
