import { describe, expect, it } from 'vitest'
import {
  APP_MENUS,
  exposedCompanySession,
  hasWorkCompany,
  homeCoverKind,
  openedCompanyCaption,
  peopleEmptyLead,
  peoplePageLead,
  showsBadgeTemplate,
  showsCompanyPicker,
  countHeading,
  countLabel,
  showsEmptyPickHint,
  showsSetupMenu,
  visibleShellMenus,
} from './nav'

const labels = (menus: { label: string }[]) => menus.map((menu) => menu.label)

describe('업무 메뉴', () => {
  it('로그인이 없거나 회사가 없으면 홈만 둔다', () => {
    expect(labels(visibleShellMenus(APP_MENUS, { signedIn: false, operator: false, hasCompany: false, moduleFlags: {} }))).toEqual([
      '홈',
    ])
    expect(labels(visibleShellMenus(APP_MENUS, { signedIn: true, operator: false, hasCompany: false, moduleFlags: {} }))).toEqual([
      '홈',
    ])
    expect(homeCoverKind(false, false)).toBe('guest')
    expect(homeCoverKind(true, false)).toBe('waiting')
    expect(homeCoverKind(true, true)).toBe('work')
  })

  it('운영 계정은 회사 없이도 회사 관리만 더 둔다', () => {
    expect(
      labels(visibleShellMenus(APP_MENUS, { signedIn: true, operator: true, hasCompany: false, moduleFlags: {} })),
    ).toEqual(['홈', '회사 관리'])
  })

  it('연결된 회사가 있으면 업무 메뉴를 연다', () => {
    expect(
      labels(
        visibleShellMenus(APP_MENUS, {
          signedIn: true,
          operator: false,
          hasCompany: true,
          moduleFlags: { stock: false },
          needsSetup: false,
        }),
      ),
    ).toEqual(['홈', '기준정보', '자산', '입퇴사', '계약', '회사 설정', '데이터 관리'])
    expect(
      labels(
        visibleShellMenus(APP_MENUS, {
          signedIn: true,
          operator: true,
          hasCompany: true,
          moduleFlags: {},
        }),
      ),
    ).toContain('회사 관리')
    expect(
      labels(
        visibleShellMenus(APP_MENUS, {
          signedIn: true,
          operator: false,
          hasCompany: true,
          moduleFlags: {},
          needsSetup: true,
        }),
      ),
    ).toContain('초기 설정')
  })

  it('멤버십을 읽기 전에는 이전 PC 세션 회사를 업무로 쓰지 않는다', () => {
    expect(hasWorkCompany(false, 'co-1')).toBe(false)
    expect(hasWorkCompany(true, '')).toBe(false)
    expect(hasWorkCompany(true, 'co-1')).toBe(true)
    expect(
      exposedCompanySession({
        enabled: true,
        loaded: false,
        companyId: 'co-1',
        companies: [{ id: 'co-1' }],
      }),
    ).toEqual({ ready: false, companyId: '', companies: [] })
    expect(
      exposedCompanySession({
        enabled: true,
        loaded: true,
        companyId: 'co-1',
        companies: [{ id: 'co-1' }],
      }).companyId,
    ).toBe('co-1')
    expect(
      exposedCompanySession({
        enabled: false,
        loaded: true,
        companyId: 'co-1',
        companies: [{ id: 'co-1' }],
      }).companyId,
    ).toBe('')
  })

  it('회사가 하나면 회사 선택 칸을 두지 않는다', () => {
    expect(showsCompanyPicker(1)).toBe(false)
    expect(showsCompanyPicker(2)).toBe(true)
    expect(showsEmptyPickHint(0)).toBe(false)
    expect(showsEmptyPickHint(2)).toBe(true)
    expect(countLabel(0)).toBe('')
    expect(countLabel(3)).toBe('3')
    expect(countHeading('이력', 0)).toBe('이력')
    expect(countHeading('이력', 2)).toBe('이력 2')
    expect(openedCompanyCaption({ display_name: '재민', company_code: 'boam' })).toBe('재민 (boam)')
    expect(peopleEmptyLead()).toContain('기준정보')
    expect(peoplePageLead(false)).toContain('기준정보에서 직원을 추가')
    expect(peoplePageLead(true)).toContain('입사 중')
    expect(peoplePageLead(true)).toContain('직원에게 배정하지 않습니다')
    expect(showsBadgeTemplate(0)).toBe(false)
    expect(showsBadgeTemplate(1)).toBe(true)
    expect(showsSetupMenu('admin_linked')).toBe(true)
    expect(showsSetupMenu('ready')).toBe(false)
  })
})
