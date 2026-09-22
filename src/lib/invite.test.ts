import { describe, expect, it } from 'vitest'
import { assertInviteRole, normalizeInviteEmail } from './invite'

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
})
