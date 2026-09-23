import { Link } from 'react-router-dom'
import type { CompanyRow } from '../lib/supabase'

export function showClosedCompanySwitch(guest: boolean, companyCount: number) {
  return !guest && companyCount > 0
}

export function ModuleClosed({
  title,
  keep,
  companies = [],
  companyId = '',
  onOpen,
}: {
  title: string
  keep?: string
  companies?: CompanyRow[]
  companyId?: string
  onOpen?: (id: string) => void
}) {
  return (
    <div className="max-w-xl space-y-3">
      <h1 className="text-3xl font-semibold">{title}</h1>
      <p className="text-sm text-muted">
        이 회사는 {title} 메뉴를 쓰지 않습니다. {keep ?? '저장된 내용은 지우지 않았습니다.'}
      </p>
      {showClosedCompanySwitch(false, companies.length) && onOpen ? (
        <label className="block text-sm">
          이 PC에서 연 회사
          <select
            className="mt-1 block rounded border border-line px-3 py-2"
            value={companyId}
            onChange={(event) => onOpen(event.target.value)}
          >
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.display_name} ({company.company_code})
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <Link className="text-sm text-accent underline" to="/settings">
        회사 설정
      </Link>
    </div>
  )
}
