import { COMPANY_MODULES } from './modules'

export const APP_MENUS = [
  { to: '/', label: '홈' },
  { to: '/setup', label: '초기 설정' },
  { to: '/master', label: '기준정보' },
  { to: '/stock', label: '구매·재고' },
  { to: '/assets', label: '자산' },
  { to: '/people', label: '입퇴사' },
  { to: '/contracts', label: '계약' },
  { to: '/ops/companies', label: '회사 관리' },
  { to: '/settings', label: '회사 설정' },
  { to: '/data', label: '데이터 관리' },
] as const

export type ShellMenu = { to: string; label: string }

export function hasWorkCompany(ready: boolean, companyId: string) {
  return ready && Boolean(companyId)
}

export function showsCompanyPicker(companyCount: number) {
  return companyCount > 1
}

export function showsEmptyPickHint(rowCount: number) {
  return rowCount > 0
}

export function countLabel(count: number) {
  return count ? String(count) : ''
}

export function openedCompanyCaption(company?: { display_name: string; company_code: string } | null) {
  if (!company) return ''
  return `${company.display_name} (${company.company_code})`
}

export function peopleEmptyLead() {
  return '직원이 없습니다. 기준정보에서 직원을 추가하세요.'
}

export function peoplePageLead(hasEmployees: boolean) {
  if (!hasEmployees) return '기준정보에서 직원을 추가하면 입사·퇴사를 여기서 진행합니다.'
  return '왼쪽 탭에서 입사 중·재직·퇴사를 고릅니다. 입사 서류(근로계약·보안·개인정보·통장·신분증)와 담당자·기한·첨부를 둡니다. 가구·컴퓨터는 자산 메뉴에서 QR로 등록하며, 직원에게 배정하지 않습니다.'
}

export function showsBadgeTemplate(employeeCount: number) {
  return employeeCount > 0
}

export function showsSetupMenu(registrationStatus?: string) {
  return registrationStatus !== 'ready'
}

export function exposedCompanySession<T>(input: {
  enabled: boolean
  loaded: boolean
  companyId: string
  companies: T[]
}) {
  const ready = !input.enabled || input.loaded
  return {
    ready,
    companyId: ready && input.enabled ? input.companyId : '',
    companies: ready && input.enabled ? input.companies : [],
  }
}

export type HomeCoverKind = 'guest' | 'waiting' | 'work'

export function homeCoverKind(signedIn: boolean, hasCompany: boolean): HomeCoverKind {
  if (!signedIn) return 'guest'
  if (!hasCompany) return 'waiting'
  return 'work'
}

export function visibleShellMenus(
  menus: readonly ShellMenu[],
  input: {
    signedIn: boolean
    operator: boolean
    hasCompany: boolean
    moduleFlags: Record<string, boolean>
    needsSetup?: boolean
  },
) {
  return menus.filter((menu) => {
    if (menu.to === '/') return true
    if (menu.to === '/ops/companies') return input.operator
    if (!input.signedIn || !input.hasCompany) return false
    if (menu.to === '/setup') return input.needsSetup !== false
    const item = COMPANY_MODULES.find((module) => module.path === menu.to)
    if (!item) return true
    return input.moduleFlags[item.id] !== false
  })
}
