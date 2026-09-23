import { describe, expect, it } from 'vitest'
import {
  COMPANY_DISPLAY,
  canEditCompanyModules,
  canEditCompanySettings,
  controlsOtherCompanies,
  memberRoleLabel,
  operatorCompanyWorkPath,
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

  it('표시는 그 회사 관리자나 운영 계정이 바꾼다', () => {
    expect(canEditCompanySettings('company_admin')).toBe(true)
    expect(canEditCompanySettings('member')).toBe(false)
    expect(canEditCompanySettings('member', true)).toBe(true)
    expect(canEditCompanySettings(undefined)).toBe(false)
  })

  it('모듈은 운영 계정만 바꾼다', () => {
    expect(controlsOtherCompanies({ company_code: 'HQ01' })).toBe(true)
    expect(controlsOtherCompanies({ company_code: 'BR01' })).toBe(false)
    expect(canEditCompanyModules(true)).toBe(true)
    expect(canEditCompanyModules(false)).toBe(false)
  })

  it('업무 목록은 멤버 회사만, 운영 계정은 등록된 회사 모두', () => {
    const companies = [
      { id: 'a', name: '가나다' },
      { id: 'b', name: '라마바' },
    ]
    expect(workCompaniesForUser(companies, ['a'])).toEqual([{ id: 'a', name: '가나다' }])
    expect(workCompaniesForUser(companies, [], true)).toEqual(companies)
    expect(workCompaniesForUser(companies, [])).toEqual([])
  })

  it('회사 관리에서 연 회사는 설정 화면으로 간다', () => {
    expect(operatorCompanyWorkPath()).toBe('/settings')
  })

  it('연결된 역할만 한글로 보여 준다', () => {
    expect(memberRoleLabel('company_admin')).toBe('회사 관리자')
    expect(memberRoleLabel('member')).toBe('사용자')
    expect(() => memberRoleLabel('platform_operator')).toThrow(/역할/)
  })
})
