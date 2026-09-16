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
- 터미널에 취약점이 보이면 진행 전 `npm audit`을 한다.
- `git`의 `-force`는 쓰기 전에 사용자에게 묻는다.
