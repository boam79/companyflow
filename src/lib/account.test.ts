import { describe, expect, it } from 'vitest'
import {
  canDeleteOwnAccount,
  deleteAccountConfirmMessage,
  operatorDeleteAccountConfirmMessage,
  shouldDropCompanyWithAccount,
  shouldDropEmptyCompanyOnOperatorDelete,
} from './account'

describe('계정 삭제', () => {
  it('운영 계정은 스스로 지우지 않고 테스트 이메일만 지운다', () => {
    expect(canDeleteOwnAccount(true)).toBe(false)
    expect(canDeleteOwnAccount(false)).toBe(true)
    expect(deleteAccountConfirmMessage()).toContain('같은 이메일')
    expect(deleteAccountConfirmMessage()).toContain('회사(지점)도 중앙에서 지웁니다')
    expect(deleteAccountConfirmMessage()).toContain('원본 파일은 남습니다')
  })

  it('회사 관리자 계정을 지우면 지점은 지우고 본사는 남긴다', () => {
    expect(
      shouldDropCompanyWithAccount({
        thisUserIsLinked: true,
        thisUserIsCompanyAdmin: true,
        operatorIsMember: false,
        otherCompanyAdmins: false,
        otherPeopleRemain: false,
      }),
    ).toBe(true)
    expect(
      shouldDropCompanyWithAccount({
        thisUserIsLinked: true,
        thisUserIsCompanyAdmin: false,
        operatorIsMember: true,
        otherCompanyAdmins: true,
        otherPeopleRemain: true,
      }),
    ).toBe(false)
    expect(
      shouldDropCompanyWithAccount({
        thisUserIsLinked: true,
        thisUserIsCompanyAdmin: true,
        operatorIsMember: false,
        otherCompanyAdmins: true,
        otherPeopleRemain: true,
      }),
    ).toBe(false)
    expect(
      shouldDropCompanyWithAccount({
        thisUserIsLinked: true,
        thisUserIsCompanyAdmin: false,
        operatorIsMember: false,
        otherCompanyAdmins: false,
        otherPeopleRemain: true,
      }),
    ).toBe(false)
    expect(
      shouldDropCompanyWithAccount({
        thisUserIsLinked: true,
        thisUserIsCompanyAdmin: false,
        operatorIsMember: false,
        otherCompanyAdmins: false,
        otherPeopleRemain: false,
      }),
    ).toBe(true)
    expect(
      shouldDropCompanyWithAccount({
        thisUserIsLinked: false,
        thisUserIsCompanyAdmin: false,
        operatorIsMember: false,
        otherCompanyAdmins: false,
        otherPeopleRemain: false,
      }),
    ).toBe(false)
  })

  it('운영자가 계정을 지우면 사람이 없는 지점도 지우고 본사는 남긴다', () => {
    expect(
      shouldDropEmptyCompanyOnOperatorDelete({
        hasMembers: false,
        hasInvites: false,
        operatorIsMember: false,
      }),
    ).toBe(true)
    expect(
      shouldDropEmptyCompanyOnOperatorDelete({
        hasMembers: true,
        hasInvites: false,
        operatorIsMember: true,
      }),
    ).toBe(false)
    expect(operatorDeleteAccountConfirmMessage()).toContain('사람이 없는 회사(지점)')
  })
})
