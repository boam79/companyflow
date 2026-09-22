import { describe, expect, it } from 'vitest'
import { COMPANY_DISPLAY, controlsOtherCompanies, memberRoleLabel, openedCompanyOnly } from './settings'

describe('회사 설정 표시', () => {
  it('기본 표시는 한국어·서울·원이다', () => {
    expect(COMPANY_DISPLAY).toEqual({ language: '한국어', timezone: '서울', currency: '원' })
  })

  it('연 회사만 화면에 남긴다', () => {
    const companies = [
      { id: 'hq', name: '본사' },
      { id: 'br', name: '지점' },
    ]
    expect(openedCompanyOnly(companies, 'hq')).toEqual([{ id: 'hq', name: '본사' }])
    expect(openedCompanyOnly(companies, '')).toEqual([])
  })

  it('다른 회사 모듈은 본사만 바꾼다', () => {
    expect(controlsOtherCompanies({ company_code: 'HQ01' })).toBe(true)
    expect(controlsOtherCompanies({ company_code: 'BR01' })).toBe(false)
    expect(controlsOtherCompanies(undefined)).toBe(false)
  })

  it('연결된 역할만 한글로 보여 준다', () => {
    expect(memberRoleLabel('company_admin')).toBe('회사 관리자')
    expect(memberRoleLabel('member')).toBe('사용자')
    expect(() => memberRoleLabel('platform_operator')).toThrow(/역할/)
  })
})
