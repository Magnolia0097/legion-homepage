# 사후 분석: 공개 레포에 `pipeline/.env` 커밋 (2026-04)

> 상태: **대응 진행 중** — 재발 방지책 도입 완료, 키 재발급 대기.
> 최종 갱신: 2026-10-14 · 근거: gitleaks 전체 히스토리 스캔, git 메타데이터, GitHub Actions 로그(보존 90일)

## 요약

Supabase **service_role 키**(RLS 우회 관리자 키)와 Gemini API 키가 담긴 `pipeline/.env`가 공개 레포에
커밋됐다. 파일은 17일 뒤 추적 해제됐지만 **git 히스토리에는 지금도 남아 있어 노출은 현재 진행형**이다.
Gemini 키는 Google이 유출 키로 탐지해 차단했고, 그 결과 파이프라인의 LLM 분류 경로가 최소
7/21부터 마지막 실행(9/19)까지 전면 실패한 채 키워드 폴백으로만 운영됐다.

## 타임라인

| 일시 (KST) | 사건 | 근거 |
|---|---|---|
| 04-10 | `frontend/.env.production` 커밋 — Firebase **웹** 설정(공개 전제 값) | `31d4a1e` |
| **04-20 21:11** | **`pipeline/.env` 최초 커밋 — 노출 시작.** GitHub 웹 UI "Create file"로 생성(committer=GitHub). `.gitignore`에 이미 `pipeline/.env`가 있었지만 웹 UI 업로드에는 적용되지 않음 | `cc04e0c` |
| 05-01 21:50 | Claude Code가 이미 추적 중이던 `.env`의 URL을 수정해 커밋 (추적 중인 파일엔 `.gitignore` 무효) | `632a1cc` |
| 05-01 | 점검 중 발견. "면접 데모 직전 일괄 처리"로 재발급 보류 결정 | 기존 기록 |
| 05-07 13:30 | `git rm --cached`로 추적 해제 — 최신 트리에서는 사라짐, **히스토리에는 잔존** | `5fe3b99` |
| ~07-21 이전 | Google이 Gemini 키를 유출 키로 차단: `403 PERMISSION_DENIED "Your API key was reported as leaked"` (정확한 시작일은 로그 보존 기간 밖이라 불명) | Actions 로그 |
| 07-21 ~ 09-19 | 확인 가능한 모든 실행에서 Gemini 403 → 애매한 글은 키워드 분류로 폴백되거나 무기한 보류(실행당 ~960건) | Actions 로그 |
| 09-19 | 마지막 파이프라인 실행. 이후 스케줄 미실행 (공개 레포 60일 무활동 시 GitHub가 cron 자동 비활성화 — 마지막 커밋 07-21) | Actions 실행 이력 |
| 10-14 | 전체 히스토리 스캔, 본 문서 재작성, CI·pre-commit 시크릿 스캔 도입 | 이 브랜치 |
| _(작성 예정)_ | 키 재발급 완료 | |

> 기존 기록의 "2026-05-01 추적 해제 완료"는 실제 커밋 기준 **05-07**로, "Claude Code 자동 커밋으로 노출"은
> **최초 노출은 웹 UI 커밋, 이후 수정 커밋이 Claude Code**로 정정했다.

## 영향 범위

gitleaks 8.24.3 `gitleaks git --log-opts=--all` (원격 전체 브랜치, 병합 커밋 제외 76개 스캔) 결과 7건. 값은 기록하지 않는다(`--redact`).

| 키 | 위치 · 커밋 | 분류 | 위험 | 상태 | 재발급 완료 |
|---|---|---|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` (JWT, role=service_role, 만료 2036-04) | `pipeline/.env:10` · cc04e0c, 632a1cc | **즉시 재발급** | 최고 — RLS를 우회해 전 테이블 읽기·수정·삭제. 만료가 10년 뒤라 재발급 전까지 사실상 영구 유효 | 유효 추정 (GitHub Secrets에 같은 키로 운영 중) | ☐ |
| `GEMINI_API_KEY` | `pipeline/.env:5` · cc04e0c, 632a1cc | **즉시 재발급** | 과금·쿼터 도용 → Google이 이미 차단해 비용 위험은 소멸, 대신 **운영 장애**(LLM 분류 중단) | Google에 의해 차단됨 | ☐ |
| `SUPABASE_ANON_KEY` (JWT, role=anon) | `pipeline/.env:9` · cc04e0c, 632a1cc | 공개 전제 | 낮음 — 원래 브라우저 번들에 들어가는 키. 권한은 RLS·GRANT가 결정(→ `004_restrict_anon_access.sql`) | 유효 | ☐ (service_role과 같은 JWT secret으로 서명돼 함께 교체됨) |
| `SUPABASE_URL` (프로젝트 ref) | `pipeline/.env:8` · 632a1cc | 공개 정보 | 없음 | — | 해당 없음 |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | `frontend/.env.production:3` · 31d4a1e (현재도 추적) | 공개 전제 | 낮음 — Firebase 웹 키는 식별자 역할. 남용 방지는 키 제한으로 | 유효 | 해당 없음 (리퍼러 제한 권장) |

추가 확인: 히스토리 전체에서 DB 비밀번호·접속 문자열(`postgres://`), GitHub·Cloudflare 토큰, Resend 키 흔적 없음
(Resend 키는 `wrangler secret`로만 관리). **DB 비밀번호는 노출되지 않았으므로 재설정 불필요.**

데이터 무결성: service_role 키 노출 기간(04-20~현재)의 변조 여부는 Supabase API 로그 보존 기간이 짧아
소급 확인이 불가능하다. 파이프라인 데이터는 재수집 가능한 공개 게시글이라 실질 피해는 제한적이다.

## 키 재발급 체크리스트 (직접 수행)

순서가 중요하다: **새 키 발급 → 소비처 갱신 → 동작 확인 → 옛 키 폐기.** Supabase 대시보드 메뉴 이름은
버전에 따라 다를 수 있다.

1. **Gemini** — [Google AI Studio](https://aistudio.google.com/) → API keys
   - [ ] 새 키 생성, Google Cloud 콘솔에서 *API restrictions*를 Generative Language API로 제한
   - [ ] 기존(차단된) 키 삭제
2. **Supabase** — 둘 중 하나
   - (권장) **새 API 키 체계로 전환**: Project Settings → API Keys에서 secret 키(`sb_secret_…`)·publishable 키 생성
     → 아래 3~5단계로 교체 → 동작 확인 후 **legacy JWT 키(anon·service_role) 비활성화**.
     옛 키를 끄는 시점을 직접 고를 수 있어 무중단 교체가 가능하다.
   - (대안) **legacy JWT secret 회전**: anon·service_role이 동시에 바뀌고 옛 키는 즉시 무효 → 3~5단계를 바로 이어서 수행.
     Supabase Auth를 쓰지 않으므로 세션 무효화 영향은 없다.
   - [ ] 완료
3. **GitHub Actions secrets** (Settings → Secrets and variables → Actions)
   - [ ] `GEMINI_API_KEY` · [ ] `SUPABASE_SERVICE_ROLE_KEY` · [ ] `SUPABASE_ANON_KEY` 갱신 (`SUPABASE_URL`은 그대로)
4. **Cloudflare Pages** 환경변수 (anon 키가 바뀐 경우)
   - [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` 갱신 → 재배포 → `/reactions/` 데이터 표시 확인
5. **로컬** `pipeline/.env`
   - [ ] 새 값으로 갱신 (`cp .env.example .env` 형식 참고)
6. **동작 확인**
   - [ ] Actions → *Voice Tracker Pipeline* → **Enable workflow**(9/19 이후 비활성) → *Run workflow*
   - [ ] 로그에 `403` 없음, `분류 성공 … 그중 Gemini N건`에서 N>0 확인
7. **옛 키 폐기** (2번 권장 경로를 택한 경우) — [ ] legacy 키 비활성화 후 6번 재확인
8. **선택**
   - [ ] GitHub → Settings → Code security → **Secret scanning·Push protection** 활성화
     (공개 레포 무료. 웹 UI 커밋까지 막아 이번 사고의 최초 경로를 차단한다)
   - [ ] Firebase 웹 키에 HTTP 리퍼러 제한(`nania-ssimdang.pages.dev/*`, `localhost`) 설정
   - [ ] 히스토리 정리 여부 결정 (아래)

## 원인

| 층위 | 원인 |
|---|---|
| 직접 | GitHub 웹 UI로 `.env`를 생성 — `.gitignore`는 로컬 `git add`에만 적용된다 |
| 확산 | 한 번 추적된 파일은 `.gitignore`가 무효 → 이후 수정분도 그대로 커밋됨(AI 에이전트 자동 커밋 포함) |
| 탐지 지연 | 커밋 시점 시크릿 스캔 없음(CI·pre-commit·push protection 모두 부재), 11일 뒤 수동 점검으로 발견 |
| 대응 지연 | 재발급을 "데모 직전"으로 미룬 결정 — 그 사이 Google이 키를 차단해 운영 장애로 번졌고, 실패가 로그 경고로만 남아 2개월 넘게 인지하지 못함 |

## 재발 방지 (적용 완료)

| 대책 | 위치 | 막는 지점 |
|---|---|---|
| gitleaks CI — push·PR의 신규 커밋 스캔, 실패 시 빨간 체크 | `.github/workflows/secret-scan.yml` | 원격 반영 직후 |
| pre-commit — gitleaks + `.env` 파일 자체 커밋 차단 | `.pre-commit-config.yaml` | 로컬 커밋 직전 |
| `.env.*` 무시 규칙 강화, 플레이스홀더만 담은 `.env.example` | `.gitignore`, `*/.env.example` | 실수로 `git add` |
| anon 키 권한 최소화(쓰기 회수, 작성자·본문 컬럼 비공개) | `supabase/migrations/004_…` (적용 승인 대기) | 공개 키 남용 |
| 실행 요약·LLM 오류율 경보 | P3 관측성 작업 | 장애의 조용한 장기화 |

남은 공백: GitHub push protection(웹 UI 경로)은 저장소 설정이라 직접 켜야 한다(체크리스트 8번).

## 히스토리 정리(`git filter-repo`) — 선택 사항, 실행하지 않음

**결론: 재발급이 본질적 대응이고, 히스토리 정리는 부가 위생 작업이다.** 재발급 후에는 남은 값이 무효라 실익이 작다.

| 장점 | 단점 |
|---|---|
| 레포를 둘러보는 사람에게 옛 키가 보이지 않음 | **이미 퍼진 사본은 못 지움** — 포크·클론·GitHub 캐시·아카이브(GH Archive 등)에 남는다 |
| 이후 전체 히스토리 스캔이 깨끗해져 CI `full_history` 점검을 상시화할 수 있음 | `cc04e0c` 이후 **모든 커밋 SHA가 바뀜** → 문서·PR 링크 깨짐, 기존 클론은 재클론 필요, 진행 중 브랜치는 재작업 |
| | 강제 푸시 필요. `refs/pull/*`는 사용자가 지울 수 없어 GitHub Support 요청 필요 |
| | 사고 기록과 실제 히스토리가 어긋나 "어떻게 대응했나"를 보여주기 어려워짐 |

절차 (승인 시):
1. 키 재발급을 **먼저** 끝낸다 (순서가 바뀌면 정리 중에도 유효 키가 노출된 상태).
2. 열린 PR·작업 브랜치를 정리하고 공동 작업자에게 공지.
3. `git clone --mirror <repo>` → `git filter-repo --path pipeline/.env --invert-paths`
4. 정리된 미러에서 `gitleaks git --log-opts=--all`로 해당 건이 사라졌는지 확인.
5. `git push --force --mirror` (브랜치 보호 일시 해제 필요).
6. GitHub Support에 캐시된 뷰·PR ref 정리 요청.
7. 모든 로컬 클론 재클론, `audit-data` 등 옛 히스토리 기반 브랜치 삭제.

## 관련: 공개 브랜치의 게시글 데이터 (시크릿 아님)

`audit-data` 브랜치에 감사 샘플 CSV(게시글 150건의 제목·URL)가 커밋돼 있다(07-21, `audit_sample.yml`이 생성).
작성자 정보는 없지만 원문 일부를 공개 레포에 재배포하는 셈이라, 골든셋 평가 체계(`pipeline/eval/`,
post_id + 라벨만 커밋)로 대체한 뒤 **브랜치 삭제와 워크플로 제거를 승인 대기 항목**으로 둔다.
