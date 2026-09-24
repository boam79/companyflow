import { describe, expect, it } from 'vitest'
import { afterInviteAcceptHref, assertInviteRole, homeInviteAcceptLabel, inviteRoleLabel, normalizeInviteEmail, showPendingInviteBanner, waitingCoverLead } from './invite'

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
