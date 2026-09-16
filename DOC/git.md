# Git 원격

## origin (유일한 원격)

```text
https://github.com/boam79/companyflow.git
```

저장소 페이지: https://github.com/boam79/companyflow

커밋·푸쉬는 **항상 이 origin만** 사용한다.

## 금지

- `origin.cursor.com` 또는 Cursor 호스팅 리모트를 만들지 않는다.
- GitHub 이외의 두 번째 origin을 추가하지 않는다.
- `main`/`master`에 `--force` 푸쉬하지 않는다. 사용자가 명시해도 먼저 경고한다.
- `git config`를 바꾸지 않는다.

## 로컬 설정

```bash
git remote -v
# origin  https://github.com/boam79/companyflow.git (fetch)
# origin  https://github.com/boam79/companyflow.git (push)
```

리모트가 없거나 다른 주소면 아래만 허용한다.

```bash
git remote add origin https://github.com/boam79/companyflow.git
# 또는
git remote set-url origin https://github.com/boam79/companyflow.git
```

## 모바일 Cursor · Cloud Agent

이 GitHub 저장소에 연결한다. 다른 포크·Cursor 원격으로 이어 가지 않는다.

## 커밋 규칙

- 사용자가 커밋을 요청했을 때만 커밋한다.
- 비밀 파일(`.env`, 키, 토큰)은 커밋하지 않는다.
- 문서 원본은 `DOC/`에 둔다. 루트 `README.md`는 이 폴더로 안내만 한다.
