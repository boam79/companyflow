import { describe, expect, it } from 'vitest'
import { canDeleteOwnAccount, deleteAccountConfirmMessage } from './account'

describe('계정 삭제', () => {
  it('운영 계정은 스스로 지우지 않고 테스트 이메일만 지운다', () => {
    expect(canDeleteOwnAccount(true)).toBe(false)
    expect(canDeleteOwnAccount(false)).toBe(true)
    expect(deleteAccountConfirmMessage()).toContain('같은 이메일')
    expect(deleteAccountConfirmMessage()).toContain('원본 파일은 남습니다')
  })
})
