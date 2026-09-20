import { Link } from 'react-router-dom'

export function GuestHomePage() {
  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-3xl font-semibold">샘플 회사</h1>
      <p className="text-sm text-muted">
        기준정보, 입고·반출, 자산, 입퇴사, 계약을 로그인 없이 확인합니다. 숫자는 가짜이며 이 PC에 남지 않습니다.
      </p>
      <Link
        className="inline-flex rounded bg-accent px-5 py-2.5 text-sm font-semibold text-white"
        to="/guest/stock"
      >
        업무 시작
      </Link>
    </div>
  )
}
