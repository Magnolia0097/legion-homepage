# 보안 사고 및 후속 조치 기록

## 사고 1: pipeline/.env 커밋 (2026-04-20)

### 발견 시점
2026-05-01, Claude Code가 .env 변경분을 자동 커밋한 직후 점검 중 발견.

### 노출 내역
- 커밋 cc04e0c (2026-04-20): 최초 .env 커밋, 노출 시작
- 커밋 632a1cc (2026-05-01): URL 수정분 추가 커밋
- 노출 기간: 약 11일
- 노출 환경: GitHub 공개 레포

### 노출된 키
- SUPABASE_SERVICE_ROLE_KEY (위험도: 높음, RLS 우회 가능)
- SUPABASE_ANON_KEY (위험도: 낮음, 공개용)
- GEMINI_API_KEY (위험도: 중간, 무료 티어지만 할당량 소진 위험)

### 결정
프로젝트 완성 + 면접 데모 준비 직전에 일괄 처리.
이유:
- 현재 운영 단계 아님 (개발 중)
- Gemini 무료 티어로 비용 위험 없음
- 프로젝트 도중 키 교체 시 .env 재설정 등 작업 부담
- 데이터 손실 시 백업으로 복구 가능

### 후속 조치 TODO

- [ ] Supabase service_role 키 재발급
- [ ] Supabase anon 키 재발급
- [ ] Gemini API 키 재발급
- [ ] git filter-repo로 히스토리에서 .env 영구 제거
- [ ] GitHub Support에 cache invalidation 요청 (선택)
- [ ] 레포 영구 비공개 또는 공개 결정

### 재발 방지

- pipeline/.env는 git rm --cached로 추적 해제 완료 (2026-05-01)
- .claude/WORKFLOW.md에 "민감 파일 보호" 규칙 추가 완료
- 향후 pre-commit hook으로 secret 스캐너 도입 검토

### 학습 포인트

- AI 위임 워크플로우의 함정: 자동 커밋 시 secret 검증 단계 빠지기 쉬움
- .gitignore는 이미 추적 중인 파일에 무효 (Git 기본 동작)
- 1인 프로젝트라도 보안 자동화 필요
