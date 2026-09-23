export const COMPANY_DISPLAY = {
  language: '한국어',
  timezone: '서울',
  currency: '원',
} as const

export function memberRoleLabel(role: string) {
  if (role === 'company_admin') return '회사 관리자'
  if (role === 'member') return '사용자'
  throw new Error('허용되지 않은 역할입니다.')
}

export function openedCompanyOnly<T extends { id: string }>(companies: T[], openId: string) {
  if (!openId) return []
  return companies.filter((company) => company.id === openId)
}

export function canEditCompanySettings(role: string | undefined, operator = false) {
  return operator || role === 'company_admin'
}

export function controlsOtherCompanies(company: { company_code: string } | undefined) {
  return company?.company_code === 'HQ01'
}

export function canEditCompanyModules(operator: boolean) {
  return operator
}

export function workCompaniesForUser<T extends { id: string }>(
  companies: T[],
  membershipIds: string[],
  operator = false,
) {
  if (operator) return companies
  const allowed = new Set(membershipIds)
  return companies.filter((company) => allowed.has(company.id))
}
