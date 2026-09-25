import { describe, expect, it } from 'vitest'
import {
  COMPANY_DISPLAY,
  canEditCompanyModules,
  canEditCompanySettings,
  controlsOtherCompanies,
  memberRoleLabel,
  openedCompanyOnly,
  settingsMembersLead,
  settingsPageLead,
  settingsShowsAdminModuleNote,
  settingsShowsCompanyPicker,
  settingsShowsExtraUserInvite,
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

  it('업무 목록은 멤버 회사만이다. 운영 계정도 멤버십 없는 회사 원본은 열지 않는다', () => {
    const companies = [
      { id: 'a', name: '가나다' },
      { id: 'b', name: '라마바' },
    ]
    expect(workCompaniesForUser(companies, ['a'])).toEqual([{ id: 'a', name: '가나다' }])
    expect(workCompaniesForUser(companies, [])).toEqual([])
  })

  it('회사 설정은 추가 사람 초대를 두지 않는다', () => {
    expect(settingsPageLead(true)).toContain('다른 회사 모듈')
    expect(settingsPageLead(false)).toContain('연결된 사람')
    expect(settingsPageLead(false)).not.toMatch(/추가 사람/)
    expect(settingsPageLead(false)).not.toMatch(/운영 계정은 다른 회사/)
    expect(settingsShowsCompanyPicker(1)).toBe(false)
    expect(settingsShowsCompanyPicker(2)).toBe(true)
    expect(settingsShowsExtraUserInvite()).toBe(false)
    expect(settingsMembersLead()).toContain('관리자 한 명')
    expect(settingsShowsAdminModuleNote()).toBe(false)
  })

  it('연결된 역할만 한글로 보여 준다', () => {
    expect(memberRoleLabel('company_admin')).toBe('회사 관리자')
    expect(memberRoleLabel('member')).toBe('사용자')
    expect(() => memberRoleLabel('platform_operator')).toThrow(/역할/)
  })
})
