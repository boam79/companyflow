import { describe, expect, it } from 'vitest'
import {
  GUEST_COMPANY,
  GUEST_COMPANY_ID,
  GUEST_MENUS,
  isGuestCompanyId,
  isGuestPath,
  workPath,
} from './ids'

describe('게스트 경로', () => {
  it('샘플 회사 id는 UUID가 아니고 본사 경로와 섞이지 않는다', () => {
    expect(GUEST_COMPANY_ID).toBe('guest-demo')
    expect(GUEST_COMPANY.display_name).toBe('샘플 회사')
    expect(isGuestCompanyId(GUEST_COMPANY_ID)).toBe(true)
    expect(isGuestCompanyId('3a27aedf-0ec9-4d28-8724-a80135eaadc3')).toBe(false)
    expect(isGuestPath('/guest')).toBe(true)
    expect(isGuestPath('/guest/stock')).toBe(true)
    expect(isGuestPath('/stock')).toBe(false)
    expect(isGuestPath('/guesting')).toBe(false)
    expect(workPath('/stock', true)).toBe('/guest/stock')
    expect(workPath('/stock', false)).toBe('/stock')
    expect(workPath('/guest/master', true)).toBe('/guest/master')
    expect(GUEST_MENUS.map((item) => item.label)).toEqual([
      '샘플',
      '기준정보',
      '구매·재고',
      '자산',
      '입퇴사',
      '계약',
    ])
    expect(GUEST_MENUS.some((item) => item.to.includes('setup') || item.to.includes('ops'))).toBe(false)
  })
})
