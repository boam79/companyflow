import type { CompanyRow } from '../supabase'

export const GUEST_COMPANY_ID = 'guest-demo'
export const GUEST_PATH = '/guest'
export const GUEST_START_PATH = `${GUEST_PATH}/stock`

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

export const GUEST_START_CARDS = [
  { to: '/guest/stock', label: '구매·재고', hint: '입고·반출·재고현황' },
  { to: '/guest/assets', label: '자산', hint: '빈 QR과 자리의 물건' },
  { to: '/guest/people', label: '입퇴사', hint: '견본 김대리' },
  { to: '/guest/contracts', label: '계약', hint: '샘플 사무실 임대' },
  { to: '/guest/master', label: '기준정보', hint: '부서·품목·창고' },
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
