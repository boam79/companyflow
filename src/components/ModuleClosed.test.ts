import { describe, expect, it } from 'vitest'
import { showClosedCompanySwitch } from './ModuleClosed'

describe('꺼진 메뉴 안내', () => {
  it('연결된 회사가 있으면 다른 회사로 바꿀 칸을 둔다', () => {
    expect(showClosedCompanySwitch(false, 2)).toBe(true)
    expect(showClosedCompanySwitch(false, 0)).toBe(false)
    expect(showClosedCompanySwitch(true, 2)).toBe(false)
  })
})
