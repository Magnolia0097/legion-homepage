# 작업 워크플로우 (주찬 전용)

## 자동 진행 원칙
다음 작업은 diff 확인 요청 없이 자동으로 커밋/푸시:
- 문서 변경 (docs/)
- 보일러플레이트 (설정 파일, 스텁, README)
- SQL 스키마 (WEEK1_TASKS.md에 명세 있는 것)
- ADR 추가/수정
- 테스트 코드
- pyproject.toml, .gitignore, .env.example

## 반드시 멈추고 확인 요청할 것
- LLM 프롬프트 변경 (pipeline/src/processors/classifier.py)
- RLS 정책 수정
- 외부 API 호출 패턴 변경 (비용 영향)
- DB 마이그레이션 파일 신규 생성 (001 외)
- .env 관련 변경
- 기존 frontend/ 코드 수정
- 삭제 작업 (파일/테이블/컬럼)

## 커밋 메시지 규칙
Conventional commits 형식:
- feat: 새 기능
- fix: 버그 수정
- docs: 문서만 변경
- refactor: 리팩토링
- chore: 빌드/설정
- test: 테스트

## 작업 완료 보고 형식
세세한 diff는 보여주지 말 것. 아래 형식만:

### 변경 요약
- 핵심 변경 3~5줄

### 내가 결정한 사항
- 자의적 판단이 필요했던 부분 (없으면 "없음")

### 주찬이 알아야 할 것
- 비용/보안/롤백 필요한 것만 (없으면 생략)

### 다음 단계
- 제안하는 다음 Task
