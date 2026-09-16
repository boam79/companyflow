# 진행 상태

마지막 갱신: 2026-09-16  
현재 역할: Executor  
구현: T1~T4 골격 + 전용 Supabase 연결  
원격: https://github.com/boam79/companyflow.git

## 지금 하는 일

로그인·`create_company` RPC를 배포 HTTPS에서 확인한다. 최초 운영 관리자는 app_metadata로 지정해야 한다.

## 보드

- [x] PRD v1.3 원문 읽기
- [x] Planner 분석
- [x] `DOC/` GitHub 보관
- [x] T1 Vite + React + TS + Tailwind + 잠금 파일 + 한글 셸
- [x] T2 전용 Supabase `companyflow` + RLS + `create_company`
- [x] T3 SQLite WASM Worker + OPFS + 탭 잠금 골격
- [x] T4 회사 생성 RPC UI + 지정 PC 초기화 + `claim_company_device`
- [ ] 최초 운영 관리자 `app_metadata.platform_operator` 지정 (가입 이메일 필요)
- [x] HTTPS 배포에 Supabase 환경 변수 연결 (홈이 ‘환경 변수 연결됨’)
- [ ] HTTPS에서 실제 로그인·회사 생성·지정 PC OPFS 재시험
- [ ] 사용자 수동 확인 T1~T4

배포 URL: https://companyflow-opal.vercel.app  
Supabase 프로젝트: `companyflow` / `vswvkypdjizldieenapx` (ACTIVE_HEALTHY, ap-northeast-2)

## 열린 질문 / 차단

1. 운영 관리자 최초 부여는 `auth.users.raw_app_meta_data.platform_operator = true` 다. 회원가입한 이메일을 알려 주면 SQL로 지정한다.
2. Playwright는 `PLAYWRIGHT_BASE_URL`이 배포 HTTPS일 때만 실행된다.
3. 자동화 브라우저에서는 OPFS persist가 거절될 수 있다. 지정 Chrome에서 다시 본다.

## MCP에서 확인한 것

- Vercel: `prj_KXGPhwGOtB8IQ2pAsnuTOZ0l3isR` / team `team_U7AuO5lMD3rtoAwkrj410jpx`. 도메인 `companyflow-opal.vercel.app`.
- Supabase 활성: `companyflow`, `boardroom`. 정지: `boam79_patient_data`, `qr-asset-manager`, `policyfund-ai-v2`.
- 보안 권고: `create_company` / `claim_company_device` 는 authenticated만 실행. anon EXECUTE 회수함.
- `service_role` 은 브라우저에 넣지 않는다.

## 최근 변경

- 2026-09-16: 전용 companyflow 프로젝트 생성, 중앙 마이그레이션 적용, 로그인 UI·회사 생성 RPC·장치 예약 RPC 연결.
