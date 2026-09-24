import { Link } from 'react-router-dom'
import { GUEST_START_CARDS, GUEST_START_PATH } from '../lib/guest/ids'

export function GuestHomePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">샘플 회사</h1>
        <p className="mt-2 text-sm text-muted">
          기준정보, 입고·반출, 자산, 입퇴사, 계약을 로그인 없이 확인합니다. 숫자는 가짜이며 이 PC에 남지 않습니다.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {GUEST_START_CARDS.map((item) => (
          <Link
            key={item.to}
            className="rounded-lg border border-line bg-card p-5 transition hover:border-accent"
            to={item.to}
          >
            <strong className="text-base">{item.label}</strong>
            <p className="mt-1 text-sm text-muted">{item.hint}</p>
          </Link>
        ))}
      </div>
      <Link
        className="inline-flex rounded bg-accent px-5 py-2.5 text-sm font-semibold text-white"
        to={GUEST_START_PATH}
      >
        업무 시작
      </Link>
    </div>
  )
}
