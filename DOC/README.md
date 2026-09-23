# CompanyFlow 문서

이 폴더가 **유일한 문서 원본**이다. 새 대화·모바일 Cursor·Cloud Agent는 구현을 시작하기 전에 아래 순서로 읽는다.

1. 이 파일 (`DOC/README.md`)
2. [`status.md`](status.md) — 지금 어디까지 했는지
3. [`tenants.md`](tenants.md) — 독립 회사·운영 계정. 화면·RLS·SQLite를 만지기 전에 읽는다
4. [`backlog.md`](backlog.md) — 다음 작업과 성공 기준
5. 작업에 필요한 문서만 추가로 연다. 요구사항 원문은 항상 [`PRD-v1.3.md`](PRD-v1.3.md)

코드를 바꾸면 같은 작업에서 `status.md`와 관련 문서를 함께 고친다. 요구사항이 바뀌면 PRD와 [`decisions.md`](decisions.md)를 같이 갱신한다.

## 문서 목록

| 파일 | 역할 |
|---|---|
| [PRD-v1.3.md](PRD-v1.3.md) | 기능·화면·데이터·기술·수용 기준 원문 |
| [analysis.md](analysis.md) | PRD 분석. 강점, 리스크, 착수 해석 |
| [architecture.md](architecture.md) | 저장 위치, 계층, 불변 규칙, 내부 명령 |
| [backlog.md](backlog.md) | T0~T9 작업 분해와 성공 기준 |
| [acceptance.md](acceptance.md) | AC-01~34 빠른 조회 |
| [decisions.md](decisions.md) | D-01~D-22와 이후 결정 |
| [lessons.md](lessons.md) | 반복하면 안 되는 실수·운영 규칙 |
| [git.md](git.md) | GitHub 원격. origin.cursor.com 금지 |
| [status.md](status.md) | 현재 진행 상태와 열린 질문 |
| [tenants.md](tenants.md) | 독립 회사·운영 계정. 이후 개발 시 필수 |

## 역할 운영

- **Planner**: 범위·순서·성공 기준을 문서에 적고 구현 전에 합의한다.
- **Executor**: `backlog.md`의 한 작업만 수행하고, 끝나면 `status.md`를 갱신한 뒤 사용자 확인을 받는다.
- 전체 완료 선언은 Planner만 한다.

## 원격

커밋·푸쉬는 [`git.md`](git.md)의 origin만 사용한다.

```text
https://github.com/boam79/companyflow.git
```
