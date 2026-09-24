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
  },
) {
  return menus.filter((menu) => {
    if (menu.to === '/') return true
    if (menu.to === '/ops/companies') return input.operator
    if (!input.signedIn || !input.hasCompany) return false
    const item = COMPANY_MODULES.find((module) => module.path === menu.to)
    if (!item) return true
    return input.moduleFlags[item.id] !== false
  })
}
