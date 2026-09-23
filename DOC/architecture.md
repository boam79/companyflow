# 아키텍처 요약

원문: [PRD-v1.3.md](PRD-v1.3.md) 9~10절.  
이 파일은 구현 중 빠르게 보기 위한 압축본이다. 충돌하면 PRD가 이긴다.

## 저장 위치

| 데이터 | 위치 |
|---|---|
| 직원·구매·입출고·재고·자산·계약·원장·감사 | 회사별 SQLite WASM + OPFS |
| 첨부·이미지·계약 원본·OCR 파일·생성 문서 | 회사별 OPFS 파일 영역 |
| 상세 설정·필드 정의·Workflow·Document Template | 로컬 DB·파일 |
| 인증·최소 회사 등록·멤버십·초대·라이선스·기기 상태 | Supabase Auth + Postgres + RLS |
| 휴대폰 입력·첨부 | Relay 임시 암호문 (기본 72시간, 회사 24~72시간) |
| 사용자 백업 | 사용자가 고른 위치의 암호화 묶음 |

Supabase에 직원 명부·발주·재고·계약 원본 등 평문 업무 데이터를 저장하지 않는다.

## 계층

| 계층 | 책임 |
|---|---|
| 화면 | 한글 목록·입력·상세. DB 직접 수정 금지 |
| 설정 해석 | 회사 필드·라벨·상태·권한·알림·양식 |
| 업무 서비스 | 구매·재고·자산·계약 검증과 명령 |
| 공통 엔진 | Workflow, Document, 알림, 계산, 감사, 중복 방지 |
| 로컬 저장 | SQLite Worker, 파일, 마이그레이션, 백업 |
| 외부 연결 | Auth, 운영정보, Encrypted Relay, OCR 어댑터 |

## 내부 명령 (예시)

- `confirm_order` / `draft_order`
- `post_receipt`
- `post_direct_in`
- `post_issue` (반출, 성명 또는 부서)
- `post_outbound` (출고)
- `post_return`
- `transfer_stock` (출고·입고 한 트랜잭션)
- `adjust_stock` (실사)
- `reverse_transaction`
- `convert_to_asset` (T7)

실행 순서: 회사·사용자·모듈·설정 버전·revision 확인 → `operation_id` 중복 확인 → 검증 → 업무·원장·자산·감사·중복방지·outbox를 한 SQLite 트랜잭션으로 저장 → 커밋된 대기 작업에서 문서·알림.

## 권한 공식

유효 신규 처리 권한 = 중앙 사용 허용 + 회사 설정 ON + 사용자 행동 권한.

모듈 OFF는 기록 삭제가 아니다. 필수 연동이 꺼져 있으면 게시·확정 전에 차단한다.

회사·운영 계정 규칙은 [tenants.md](tenants.md)가 이긴다. 본사 코드로 업무를 분기하지 않는다.

## 설정으로 끄지 않는 불변 규칙

- 회사 격리. 상세 [tenants.md](tenants.md)
- 거래 원자성
- `operation_id` 중복 방지
- 원장·감사 이력
- 반출 시 성명 또는 부서 최소 1개
- Relay 암호화 (기능을 켤 때)
- 초안은 현재고·확정 통계에 미반영
- 확정 거래는 덮어쓰기·삭제 대신 정정·반대 거래
- 화면에서 DB 직접 수정 금지
- 회사별 예외 코드 (`if company_id == B`) 금지

## 중앙 최소 모델

`companies`, `company_memberships`, `company_invitations`, `company_entitlements`, `company_devices`, `company_setup_operations`

상세 설정·Template·업무 원본은 중앙에 두지 않는다.

## 개발 시작 스택 (가변은 검증 후 교체)

| 영역 | 기술 | 상태 |
|---|---|---|
| 언어·화면 | TypeScript + React | 가변 |
| 빌드 | Vite | 가변 |
| UI | Tailwind CSS + shadcn/ui | 가변 |
| 로컬 DB | @sqlite.org/sqlite-wasm | 확정 |
| 로컬 파일 | OPFS | 확정 |
| DB·OCR | Web Worker | 확정 |
| 인증·운영 | Supabase Auth + Postgres + RLS | 확정 |
| 암호화 | Web Crypto API | 확정 |
| 검증 | Vitest + Playwright | 가변 |
| 배포 | HTTPS 정적 호스팅 | 미정 |

## 활성화 게이트

| 항목 | 확정 전 | 실사용 전 조건 |
|---|---|---|
| OPFS VFS·브라우저 | 저장 인터페이스·화면·모델 | 영속 저장·잠금·재실행·용량 시험 |
| Relay 암호·키 | 봉투·수신·중복 방지 구조 | 키 수명주기·프로토콜·격리 |
| 백업 암호·복구 | 묶음·무결성·임시 복원 | 암호·실패 시 원본 보존 |
| OCR 품질 | 직접 등록·원본·확인 화면 | 한글·영어·다중 페이지 시험 |
| 오프라인 권한 | 온라인 인증 후 로컬 업무 | 유효기간·회수·재로그인 |
| 호스팅 헤더 | 정적 빌드 | Worker·WASM·OPFS·보안 헤더 |
