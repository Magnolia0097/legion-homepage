# eval — 분류 품질 평가

"LLM 분류 결과를 어떻게 검증했나"에 숫자로 답하기 위한 재현 가능한 평가 체계.

| 단계 | 명령 (`pipeline/`에서) | 산출물 |
|---|---|---|
| 1. 골든셋 추출 | `uv run python -m eval.sample_golden --cutoff 2026-10-01` | `golden/golden_v1.csv`(post_id), `golden/golden_v1.meta.json` |
| 2. 사람 라벨링 | `uv run python -m eval.label` — 기준: [LABELING_GUIDE.md](LABELING_GUIDE.md) | `golden_v1.csv`에 label·ambiguous 채움 |
| 3. 평가 실행 | _(라벨링 완료 후 추가 예정)_ | `REPORT.md`, 혼동행렬 이미지 |

설계 원칙
- **층화 기준은 게시판×월**. 분류기 예측값으로 층화하지 않는다 — 예측으로 뽑으면 그 분류기에 유리한 표본이 된다.
  (기존 `scripts/sample_for_audit.py`는 sentiment별 50건씩 뽑는 방식이라 이 문제가 있어 골든셋으로 대체)
- **정답은 사람만 단다.** LLM으로 정답을 채우면 검증 대상이 스스로를 검증하게 된다.
- **원문은 커밋하지 않는다.** 커밋은 `post_id`·라벨뿐이고 제목·본문은 `.cache/`(gitignore)에만 둔다.
  다른 PC에서는 라벨링 도구가 DB에서 원문을 다시 받아온다(service_role 키 필요).
- **재현성**: 시드·기준일(cutoff)·코드 커밋·층별 모집단/표본 수를 meta.json에 기록. 같은 DB에서 같은 인자로
  다시 뽑으면 같은 표본이 나온다(층별 문자열 시드라 다른 층 데이터가 늘어도 해당 층 표본은 유지).
