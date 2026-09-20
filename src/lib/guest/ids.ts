import type { CompanyRow } from '../supabase'

export const GUEST_COMPANY_ID = 'guest-demo'
export const GUEST_PATH = '/guest'

export const GUEST_COMPANY: CompanyRow = {
  id: GUEST_COMPANY_ID,
  display_name: '샘플 회사',
  company_code: 'DEMO',
  registration_status: 'guest',
}

export const GUEST_MENUS = [
  { to: '/guest', label: '샘플' },
  { to: '/guest/master', label: '기준정보' },
  { to: '/guest/stock', label: '구매·재고' },
  { to: '/guest/assets', label: '자산' },
  { to: '/guest/people', label: '입퇴사' },
  { to: '/guest/contracts', label: '계약' },
] as const

export function isGuestCompanyId(companyId: string) {
  return companyId === GUEST_COMPANY_ID
}

export function isGuestPath(pathname: string) {
  return pathname === GUEST_PATH || pathname.startsWith(`${GUEST_PATH}/`)
}

export function workPath(path: string, guest: boolean) {
  if (!guest) return path
  if (path === GUEST_PATH || path.startsWith(`${GUEST_PATH}/`)) return path
  if (path === '/') return GUEST_PATH
  return `${GUEST_PATH}${path}`
}
