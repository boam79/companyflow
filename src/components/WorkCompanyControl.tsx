import { openedCompanyCaption, showsCompanyPicker } from '../lib/company/nav'

type WorkCompany = {
  id: string
  display_name: string
  company_code: string
}

export function WorkCompanyControl({
  guest,
  companies,
  companyId,
  onChange,
}: {
  guest: boolean
  companies: WorkCompany[]
  companyId: string
  onChange: (id: string) => void
}) {
  if (guest) {
    return <p className="rounded border border-line px-3 py-2 text-sm text-muted">샘플 회사</p>
  }
  const open = companies.find((row) => row.id === companyId) ?? companies[0]
  if (!showsCompanyPicker(companies.length)) {
    return open ? (
      <p className="rounded border border-line px-3 py-2 text-sm text-muted">{openedCompanyCaption(open)}</p>
    ) : null
  }
  return (
    <select
      className="rounded border border-line px-3 py-2 text-sm"
      value={companyId}
      onChange={(event) => onChange(event.target.value)}
    >
      {!companyId ? <option value="">회사 선택</option> : null}
      {companies.map((company) => (
        <option key={company.id} value={company.id}>
          {openedCompanyCaption(company)}
        </option>
      ))}
    </select>
  )
}
