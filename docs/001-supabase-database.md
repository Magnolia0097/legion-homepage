# ADR 001: Supabase PostgreSQL을 데이터베이스로 선택

**날짜**: 2026-04-19
**상태**: Accepted
**결정자**: 주찬

## 맥락

Aion 2 여론 파이프라인을 길드 홈페이지(legion-homepage)에 통합하는 과정에서
데이터베이스 선택이 필요했다. 후보:

1. Cloudflare D1 (SQLite, 이미 Cloudflare 스택 사용 중)
2. Supabase PostgreSQL
3. Neon PostgreSQL
4. 로컬 PostgreSQL (Docker)

## 비교

| 항목 | Cloudflare D1 | Supabase | Neon | 로컬 Docker |
|------|---------------|----------|------|-------------|
| 무료 티어 | 10GB | 500MB + 5GB 대역폭 | 0.5GB | 무제한 |
| SQL 타입 | SQLite | PostgreSQL | PostgreSQL | PostgreSQL |
| JSONB | ❌ | ✅ | ✅ | ✅ |
| Full-text search | 제한적 | ✅ | ✅ | ✅ |
| Cloudflare 연동 | 네이티브 | HTTP API | HTTP driver | 직접 연결 |
| 관리 부담 | 없음 | 없음 | 없음 | 높음 |
| 항상 켜짐 | ✅ | 7일 비활성 시 일시중지 | 콜드 스타트 | 본인 PC 켜야 함 |

## 결정

**Supabase PostgreSQL 선택.**

## 근거

1. **DBA 경력 활용** — Oracle/MariaDB 3년 경력을 PostgreSQL 스키마 설계 및
   쿼리 튜닝으로 자연스럽게 연결. SQLite로는 이 강점이 덜 살아남.

2. **JSONB 지원** — LLM 분류 결과가 가변 구조(카테고리, 키워드 배열)이므로
   JSONB가 필수. D1은 TEXT로 저장해야 하고 쿼리 시 파싱 비용 있음.

3. **분석 쿼리 역량** — `GROUP BY`, 윈도우 함수, `PERCENTILE_CONT`,
   `generate_series` 등 집계 테이블 갱신에 필수적인 기능들이 PostgreSQL엔
   풍부하지만 SQLite엔 제한적.

4. **비용** — 500MB 제한이지만 예상 데이터 크기(월 30MB)의 16배 여유.
   무료 티어로 1년 이상 충분. 대역폭도 개인+길드원 사용 수준으로 5GB 충분.

5. **일시중지 리스크 회피** — 7일 비활성 시 일시중지되지만, 파이프라인이
   30분마다 INSERT 하므로 항상 활성 상태 유지됨.

## 대안을 선택하지 않은 이유

- **D1**: SQLite 한계로 분석 쿼리 작성이 불편. DBA 경력 어필 약함.
- **Neon**: Supabase와 기능 유사하나 콜드 스타트 400~750ms 있음. 또한
  Supabase는 대시보드 UI가 더 완성도 높아 개발 속도 빠름.
- **로컬 Docker**: 본인 PC 항상 켜둬야 하고 외부 접근 위해 터널링 필요.
  대시보드를 Cloudflare Pages에 배포하는 구조와 맞지 않음.

## 결과 및 위험

**긍정**:
- PostgreSQL 스킬 포트폴리오에 반영 가능
- 확장 시 Supabase Pro ($25) 또는 Neon/RDS로 스키마 그대로 이전 가능

**위험 및 대응**:
- 500MB 초과 시: 오래된 `raw_posts` 아카이브 + 집계만 유지
- 5GB 대역폭 초과 시: 서버 사이드 캐싱, API 응답 경량화
- 7일 비활성 시 일시중지: 파이프라인 정상 작동 여부 모니터링

## 참고

- Supabase 무료 티어 문서: https://supabase.com/pricing
- 2026년 4월 기준 확인
