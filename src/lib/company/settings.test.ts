import { describe, expect, it } from 'vitest'
import {
  COMPANY_DISPLAY,
  canEditCompanySettings,
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

  it('모듈은 그 회사 관리자만 바꾸고 운영 권한만으로는 못 바꾼다', () => {
    expect(canEditCompanySettings('company_admin')).toBe(true)
    expect(canEditCompanySettings('member')).toBe(false)
    expect(canEditCompanySettings(undefined)).toBe(false)
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
