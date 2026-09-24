import { Link } from 'react-router-dom'
import { workSessionKind } from '../lib/company/workGate'

export function WorkGateNotice({
  guest,
  signedIn,
  ready,
  companyId,
  loginHint,
}: {
  guest: boolean
  signedIn: boolean
  ready: boolean
  companyId: string
  loginHint: string
}) {
  const kind = workSessionKind({ guest, signedIn, ready, companyId })
  if (kind === 'ok') return null
  if (kind === 'loading') return <p className="text-sm text-muted">회사를 확인하는 중입니다.</p>
  if (kind === 'no-company') return <p className="text-sm">연결된 회사가 없습니다.</p>
  return (
    <p className="text-sm">
      {loginHint}{' '}
      <Link className="text-accent underline" to="/login">
        로그인
      </Link>
    </p>
  )
}
