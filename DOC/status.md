# 진행 상태

마지막 갱신: 2026-09-17  
현재 역할: Executor  
구현: T1~T6 완료 + T7 자산화·입퇴사·통계 진행 중 (배정 미확인)  
원격: https://github.com/boam79/companyflow.git

## 지금 하는 일

지정 Chrome에서 퇴사 → 미회수 3건 차단, https://companyflow-opal.vercel.app/reports 배정 3을 확인한다.

## 보드

- [x] PRD v1.3 원문 읽기
- [x] Planner 분석
- [x] `DOC/` GitHub 보관
- [x] T1 Vite + React + TS + Tailwind + 잠금 파일 + 한글 셸
- [x] T2 전용 Supabase `companyflow` + RLS + `create_company`
- [x] T3 SQLite WASM Worker + OPFS + 탭 잠금 골격
- [x] T4 회사 생성 → 지정 PC 초기화 → 사용 가능 (SAH Pool)
- [x] 최초 운영 관리자 `app_metadata.platform_operator` 지정 (`pjm7908@hanmail.net`)
- [x] HTTPS에서 운영자 로그인·회사 생성(`본사` / HQ01)
- [x] T5 기준정보 화면 (부서·직원·품목·거래처·창고·필드, operation_id)
- [x] 사용자: `/master` 에서 본사 `총무` 확인
- [x] T6 구매·재고 수불부 (반출 4 → 회사 합계 7, 본사 5, 부속 2)
- [ ] T7 자산 배정·회수·퇴사 미회수 (`/people` `/assets` `/reports`)

배포 URL: https://companyflow-opal.vercel.app  
Supabase 프로젝트: `companyflow` / `vswvkypdjizldieenapx` (ACTIVE_HEALTHY, ap-northeast-2)

## 열린 질문 / 차단

1. Chrome persist()는 꺼져 있어도 OPFS SAH Pool이면 실데이터를 진행한다. 북마크하면 권한이 더 잘 붙는다.
2. Playwright는 `PLAYWRIGHT_BASE_URL`이 배포 HTTPS일 때만 실행된다.
3. 운영 권한은 `app_metadata.platform_operator`만 본다. 비밀번호는 저장소에 적지 않는다.

## MCP에서 확인한 것

- Vercel: `prj_KXGPhwGOtB8IQ2pAsnuTOZ0l3isR` / team `team_U7AuO5lMD3rtoAwkrj410jpx`. 도메인 `companyflow-opal.vercel.app`.
- Supabase 활성: `companyflow`, `boardroom`. 정지: `boam79_patient_data`, `qr-asset-manager`, `policyfund-ai-v2`.
- `confirm_company_device` RPC 추가. 초기 설정 성공 후 원본 장치를 confirmed 로 올린다.

## 최근 변경

- 2026-09-17: 재입사·서울 일자 통계 확인. 입퇴사에 배정 1 막대.
- 2026-09-16: `/stock` 입출고를 수불부 한 표로 이어 보이게 바꿈. 명령 폼은 표 아래.
- 2026-09-16: SAH Pool Access Handle 충돌 수정. 앱 전역 SQLite 1개. 지정 Chrome은 탭 하나만 남기고 새로고침.
- 2026-09-16: T6 구매·재고 공통 명령. 확정 원장만 현재고. `/stock` 화면. SAH Pool 트랜잭션 묶음.
- 2026-09-16: 지정 PC 사용 가능 확인 후 T5 기준정보 추가·장치 확정 RPC.
