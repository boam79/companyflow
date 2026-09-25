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

export function settingsPageLead(operator: boolean) {
  if (operator) {
    return '운영 계정은 다른 회사 모듈만 켭니다. 사람·재고·자산·계약은 그 회사 지정 PC에서만 보입니다.'
  }
  return '이 회사 사람과 표시를 다룹니다. 추가 사람은 여기서 붙입니다. 가입 후 홈에서 수락합니다.'
}

export function settingsShowsCompanyPicker(companyCount: number) {
  return companyCount > 1
}

export function settingsInviteLead() {
  return '이 회사 사람만 붙입니다. 메일은 보내지 않습니다. 그 이메일은 가입한 뒤 홈에서 수락합니다.'
}

export function settingsInviteDoneMessage() {
  return '초대를 남겼습니다. 그 이메일은 가입한 뒤 홈에서 수락합니다.'
}

export function workCompaniesForUser<T extends { id: string }>(
  companies: T[],
  membershipIds: string[],
) {
  const allowed = new Set(membershipIds)
  return companies.filter((company) => allowed.has(company.id))
}
