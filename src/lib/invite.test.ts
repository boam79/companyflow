import { describe, expect, it } from 'vitest'
import { afterInviteAcceptHref, assertCustomerAdminEmail, assertInviteRole, homeInviteAcceptLabel, inviteRoleLabel, normalizeInviteEmail, OPERATOR_EMAIL_NOT_CUSTOMER, opsCreateLead, opsPageLead, showPendingInviteBanner, waitingCoverLead } from './invite'

describe('회사 사용자 초대', () => {
  it('이메일은 소문자로 맞추고 빈 칸은 거절한다', () => {
    expect(normalizeInviteEmail('  User@Example.com ')).toBe('user@example.com')
    expect(() => normalizeInviteEmail('not-an-email')).toThrow(/이메일/)
  })

  it('역할은 회사 관리자와 사용자만 받는다', () => {
    expect(assertInviteRole('member')).toBe('member')
    expect(assertInviteRole('company_admin')).toBe('company_admin')
    expect(() => assertInviteRole('platform_operator')).toThrow(/역할/)
  })

  it('팔 회사 최초 관리자에 운영자 이메일을 받지 않는다', () => {
    expect(assertCustomerAdminEmail('  Customer@Example.com ', 'pjm7908@hanmail.net')).toBe(
      'customer@example.com',
    )
    expect(() => assertCustomerAdminEmail('pjm7908@hanmail.net', 'pjm7908@hanmail.net')).toThrow(
      OPERATOR_EMAIL_NOT_CUSTOMER,
    )
    expect(() => assertCustomerAdminEmail('PJM7908@hanmail.net', 'pjm7908@hanmail.net')).toThrow(
      /고객 이메일/,
    )
  })

  it('운영 회사 관리는 회사 생성만 두고 추가 사람은 붙이지 않는다', () => {
    expect(opsCreateLead()).toContain('새 회사')
    expect(opsCreateLead()).toContain('최초 관리자')
    expect(opsPageLead()).toContain('관리자 한 명')
    expect(opsPageLead()).not.toMatch(/사용자 초대/)
    expect(opsPageLead()).not.toMatch(/추가 사람/)
  })

  it('회사 관리자 수락은 초기 설정으로, 사용자는 홈으로 간다', () => {
    expect(afterInviteAcceptHref()).toBe('/')
    expect(afterInviteAcceptHref('member')).toBe('/')
    expect(afterInviteAcceptHref('company_admin')).toBe('/setup')
  })

  it('홈 표지 수락 문구와 어두운 홈에서 배너를 숨긴다', () => {
    expect(inviteRoleLabel('company_admin')).toBe('회사 관리자')
    expect(homeInviteAcceptLabel('지점')).toBe('지점 수락')
    expect(waitingCoverLead(0)).toContain('이 화면에서 수락')
    expect(waitingCoverLead(0)).not.toMatch(/업무 시작/)
    expect(waitingCoverLead(1)).toContain('아래 수락')
    expect(
      showPendingInviteBanner({ pathname: '/', scanMode: false, guest: false, signedIn: true }),
    ).toBe(false)
    expect(
      showPendingInviteBanner({ pathname: '/settings', scanMode: false, guest: false, signedIn: true }),
    ).toBe(true)
    expect(
      showPendingInviteBanner({ pathname: '/settings', scanMode: false, guest: false, signedIn: false }),
    ).toBe(false)
  })
})
