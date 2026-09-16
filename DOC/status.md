# 진행 상태

마지막 갱신: 2026-09-16  
현재 역할: Executor  
구현: T1~T4 골격 (단위 테스트·프로덕션 빌드 통과)  
원격: https://github.com/boam79/companyflow.git

## 지금 하는 일

단계 1 기반 앱을 GitHub에 올리고 HTTPS 프리뷰로 검증한다.

## 보드

- [x] PRD v1.3 원문 읽기
- [x] Planner 분석
- [x] `DOC/` GitHub 보관
- [x] T1 Vite + React + TS + Tailwind + 잠금 파일 + 한글 셸
- [x] T2 중앙 모델 SQL·RLS 초안 (`supabase/migrations`)
- [x] T3 SQLite WASM Worker + OPFS + 탭 잠금 골격
- [x] T4 회사 생성 요청 UI + 지정 PC 초기화 상태기계
- [ ] 전용 Supabase 프로젝트 (무료 활성 프로젝트 한도 2개로 생성 실패)
- [ ] HTTPS 배포 URL에서 OPFS 실사용 재시험 (첫 배포에서 SQLITE_CANTOPEN, 경로 수정 후 재배포)
- [ ] 사용자 수동 확인

배포 URL: https://companyflow-opal.vercel.app

## 열린 질문 / 차단

1. 전용 Supabase `companyflow` 프로젝트를 만들려면 기존 활성 프로젝트 1개를 일시정지하거나 유료 한도를 올려야 한다. 다른 제품 DB(`boardroom`, `boam79_patient_data`)에는 스키마를 넣지 않았다.
2. 운영 관리자 최초 부여는 `auth.users.raw_app_meta_data.platform_operator = true` 로 한다. 대시보드 수동 지정.
3. Playwright는 `PLAYWRIGHT_BASE_URL`이 배포 HTTPS일 때만 실행된다.

## MCP에서 확인한 것

- Vercel 팀: `team_U7AuO5lMD3rtoAwkrj410jpx` (hobby). companyflow 프로젝트는 아직 없음.
- Render 워크스페이스: `tea-d3rlo7fdiees73bqu9jg`. companyflow 서비스 없음.
- 공공 API 후보: 나라장터 계약정보. 후속.
- 개인정보 보호법(법령ID 011357) 존재 확인. 직원·계약 원본은 지정 PC에만 둔다.
- Harness·Google Drive 인증은 사용자가 건너뜀. Firecrawl·감가상각 MCP는 응답 없음.

## 최근 변경

- 2026-09-16: Vite 앱, 로컬 SQLite worker, 중앙 SQL, Vitest 6건 통과, `npm run build` 통과.
