import { describe, expect, it } from 'vitest'
import {
  COMPANY_DISPLAY,
  canEditCompanyModules,
  canEditCompanySettings,
  controlsOtherCompanies,
  memberRoleLabel,
  openedCompanyOnly,
  workCompaniesForUser,
} from './settings'

describe('회사 설정 표시', () => {
  it('기본 표시는 한국어·서울·원이다', () => {
    expect(COMPANY_DISPLAY).toEqual({ language: '한국어', timezone: '서울', currency: '원' })
  })

  it('연 회사만 화면에 남긴다', () => {
    const companies = [
      { id: 'a', name: '가나다' },
      { id: 'b', name: '라마바' },
    ]
    expect(openedCompanyOnly(companies, 'a')).toEqual([{ id: 'a', name: '가나다' }])
    expect(openedCompanyOnly(companies, '')).toEqual([])
  })

  it('표시는 그 회사 관리자가 바꾼다', () => {
    expect(canEditCompanySettings('company_admin')).toBe(true)
    expect(canEditCompanySettings('member')).toBe(false)
    expect(canEditCompanySettings(undefined)).toBe(false)
  })

  it('다른 회사 모듈은 본사 최고 관리자만 바꾼다', () => {
    expect(controlsOtherCompanies({ company_code: 'HQ01' })).toBe(true)
    expect(controlsOtherCompanies({ company_code: 'BR01' })).toBe(false)
    expect(canEditCompanyModules(true, { company_code: 'HQ01' })).toBe(true)
    expect(canEditCompanyModules(true, { company_code: 'BR01' })).toBe(false)
    expect(canEditCompanyModules(false, { company_code: 'HQ01' })).toBe(false)
  })

  it('업무 목록에는 멤버로 연결된 회사만 남긴다', () => {
    const companies = [
      { id: 'a', name: '가나다' },
      { id: 'b', name: '라마바' },
    ]
    expect(workCompaniesForUser(companies, ['a'])).toEqual([{ id: 'a', name: '가나다' }])
    expect(workCompaniesForUser(companies, [])).toEqual([])
  })

  it('연결된 역할만 한글로 보여 준다', () => {
    expect(memberRoleLabel('company_admin')).toBe('회사 관리자')
    expect(memberRoleLabel('member')).toBe('사용자')
    expect(() => memberRoleLabel('platform_operator')).toThrow(/역할/)
  })
})
