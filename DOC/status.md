# 진행 상태

마지막 갱신: 2026-09-16  
현재 역할: Executor  
구현: T1~T4 + 운영자 계정 + T5 기준정보 골격  
원격: https://github.com/boam79/companyflow.git

## 지금 하는 일

로그인·회사 생성은 배포 HTTPS에서 확인했다. 지정 Chrome에서 OPFS 초기 설정과 기준정보를 이어서 본다.

## 보드

- [x] PRD v1.3 원문 읽기
- [x] Planner 분석
- [x] `DOC/` GitHub 보관
- [x] T1 Vite + React + TS + Tailwind + 잠금 파일 + 한글 셸
- [x] T2 전용 Supabase `companyflow` + RLS + `create_company`
- [x] T3 SQLite WASM Worker + OPFS + 탭 잠금 골격
- [x] T4 회사 생성 RPC UI + 지정 PC 초기화 + `claim_company_device`
- [x] 최초 운영 관리자 `app_metadata.platform_operator` 지정 (`pjm7908@hanmail.net`)
- [x] HTTPS에서 운영자 로그인·회사 생성(`본사` / HQ01)
- [x] T5 기준정보 로컬 테이블·화면 골격
- [ ] 지정 Chrome에서 OPFS 초기 설정 재시도 (SAH Pool VFS)

배포 URL: https://companyflow-opal.vercel.app  
Supabase 프로젝트: `companyflow` / `vswvkypdjizldieenapx` (ACTIVE_HEALTHY, ap-northeast-2)

## 열린 질문 / 차단

1. 지정 Chrome에서 https://companyflow-opal.vercel.app 로그인 후 `/setup` 으로 본사 PC를 원본 장치로 설정한다. 자동화 브라우저는 persist를 거절할 수 있다.
2. Playwright는 `PLAYWRIGHT_BASE_URL`이 배포 HTTPS일 때만 실행된다.
3. 운영 권한은 `app_metadata.platform_operator`만 본다. 비밀번호는 저장소에 적지 않는다.

## MCP에서 확인한 것

- Vercel: `prj_KXGPhwGOtB8IQ2pAsnuTOZ0l3isR` / team `team_U7AuO5lMD3rtoAwkrj410jpx`. 도메인 `companyflow-opal.vercel.app`.
- Supabase 활성: `companyflow`, `boardroom`. 정지: `boam79_patient_data`, `qr-asset-manager`, `policyfund-ai-v2`.
- 보안 권고: `create_company` / `claim_company_device` 는 authenticated만 실행. anon EXECUTE 회수함.
- `service_role` 은 브라우저에 넣지 않는다.

## 최근 변경

- 2026-09-16: 운영자 `pjm7908@hanmail.net` 지정, 본사(HQ01) 생성, T5 기준정보 골격.
