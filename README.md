# CompanyFlow

한국 기업용 회사별 맞춤형 업무관리 웹앱.

요구사항·분석·개발 계획·의사결정은 [`DOC/`](DOC/README.md)에서 이어 간다.

- 원격: [https://github.com/boam79/companyflow](https://github.com/boam79/companyflow)
- 제품 기준: [`DOC/PRD-v1.3.md`](DOC/PRD-v1.3.md)
- 지금 할 일: [`DOC/status.md`](DOC/status.md)

## 로컬 실행 (개발용)

기능 검증은 배포 HTTPS URL에서 합니다. 아래는 빌드 확인용입니다.

```bash
npm install
npm test
npm run build
```

환경 변수는 `.env.example`을 참고합니다. `service_role` 키는 넣지 않습니다.
