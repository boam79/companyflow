# 교훈

고치거나 새로 알게 된 규칙은 여기 추가한다. 같은 실수를 반복하지 않기 위한 파일이다.

## 원격·저장소

- CompanyFlow 커밋·푸쉬 origin은 `https://github.com/boam79/companyflow.git`만 사용한다.
- `origin.cursor.com` 또는 다른 리모트를 만들지 않는다.
- hem(`https://github.com/boam79/hem`)과 이 저장소는 별개다. 서로 푸쉬하지 않는다.
- 모바일 Cursor·Cloud Agent도 이 GitHub 저장소에 연결한다.

## 문서

- 문서 원본은 `DOC/`다. 루트 `README.md`는 안내만 한다.
- `.cursor/scratchpad.md`는 로컬 작업 메모일 수 있다. 결정·계획·상태는 `DOC/`에 반영해야 다음 대화에서 이어진다.
- 요구사항 변경 시 PRD와 `decisions.md`를 함께 고친다.

## 검증

- 기능 검증·E2E·스모크는 배포된 HTTPS URL에서 한다. localhost로 대체하지 않는다.
- UI만 보는 테스트로 재고·원자성 정확성을 대신하지 않는다.

## 구현

- PRD 11.2 "첫날"은 일정 약속이 아니다. 11.1 단계 수용 기준을 통과하기 전에 다음 연결 기능을 켜지 않는다.
- 미정 항목(OPFS VFS, Relay 키, 백업 암호, 호스팅)은 관련 실사용만 막고, 공통 인터페이스·로컬 모델·직접 입력 화면은 진행할 수 있다.
- 회사별 예외 코드(`if company_id == B`)를 만들지 않는다.
- 파일을 고치기 전에 읽는다.
- 터미널에 취약점이 보이면 진행 전 `npm audit`을 한다. `--force` 없이  hoisting 가능한 패치(예: vitest 5)를 우선한다.
- `git`의 `-force`는 쓰기 전에 사용자에게 묻는다.
- 다른 제품의 활성 Supabase 프로젝트에 CompanyFlow 스키마를 섞지 않는다. 무료 활성 한도 2개면 사용하지 않는 프로젝트를 일시정지한 뒤 전용 프로젝트를 만든다.
- 운영 권한은 `app_metadata.platform_operator`만 본다. user_metadata 자가 승격은 무시한다.
- `SECURITY DEFINER` RPC는 `anon` EXECUTE를 회수한다. 함수 본문에서 운영자 여부를 다시 검사한다.
- sqlite-wasm OPFS 파일은 워커에서 중첩 디렉터리(`/companyflow/...`) 대신 `/company_*.sqlite3`처럼 평탄한 경로를 쓴다. 중첩 경로는 SQLITE_CANTOPEN이 난다.
- sqlite-wasm 기본 `opfs` VFS는 중첩 워커(`sqlite3-opfs-async-proxy`)가 필요하다. Vite 번들·첫 방문에서 실패하면 메모리 DB로 넘어가 `persistOk=false`가 된다. 지정 PC 원본은 `installOpfsSAHPoolVfs`를 쓴다.
- Chrome `navigator.storage.persist()`는 북마크·PWA 전에는 false인 경우가 많다. 실데이터 시작 기준은 persist()가 아니라 OPFS 파일 개방이다.
- 재고는 상태 라벨이 아니라 확정 원장 `qty_delta` 합이다. 이동은 출고·입고 두 줄을 한 SQLite `BEGIN IMMEDIATE` 묶음으로 넣는다.
- SAH Pool은 파일 Access Handle을 독점한다. 화면마다 Worker를 새로 만들면 `/master` → `/stock` 이동이나 여러 탭에서 `createSyncAccessHandle` 오류가 난다. 앱 전역 SQLite 연결 하나를 재사용한다.
- 통계 일자는 UTC `slice(0,10)`이 아니라 `Asia/Seoul` 업무일이다. 창고 이동은 회사 입고·출고 합계와 일반 비품 상세에서 뺀다.
- 입퇴사 텍스트 링크는 건너뛰기 쉽다. 다음 거래는 수불부와 같이 **배정 1** 막대로 둔다.
- 미회수가 있으면 회수·퇴사를 배정보다 먼저 올린다. 회수 직후 배정 막대를 다시 띄우면 배정·회수가 반복된다.
- 퇴사 회수는 회사 재고가 아니라 직원 지급품(명찰·유니폼·노트북)이다. 복사용지는 재고만 관리하고 자산화·퇴사 미회수에 넣지 않는다.
- 책상·컴퓨터는 자리에 두는 회사 자산이다. 직원에게 배정하지 않고, 미회수로 퇴사를 막지 않는다. QR의 담당·부서는 자산 정보다.
- `/stock` 현재고는 비품만 품목 한 줄에 창고 칸을 나란히 둔다. 책상·컴퓨터 0수량 행을 재고 표에 넣지 않는다.
- 복사용지 비품은 자산화·본사창고 이동 화면으로 가지 않는다. 수불부는 입고·반출·반납만 보여 준다.
- `/stock` 매일 화면은 입고·반출·재고현황이 기본이다. 발주 확정→수령 두 단계는 더 보기로 접고, 재고 증가는 `post_direct_in`(입고)이다. 명령 엔진은 지우지 않는다.
- 입퇴사는 직원 수만큼 카드를 쌓지 않는다. 왼쪽 목록에서 한 명만 연다.
