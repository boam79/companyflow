import { describe, expect, it } from 'vitest'
import { publicErrorMessage } from './publicError'

describe('공개 오류 문구', () => {
  it('객체 오류는 [object Object] 대신 내용을 보여 준다', () => {
    expect(publicErrorMessage({ message: { message: 'function gen_random_bytes(integer) does not exist' } })).toBe(
      '회사 관리자 초대를 만들지 못했습니다. 다시 시도하세요.',
    )
    expect(publicErrorMessage({ message: '이미 있는 회사코드입니다.' })).toBe('이미 있는 회사코드입니다.')
    expect(
      publicErrorMessage({
        code: '23505',
        message: 'duplicate key value violates unique constraint "companies_company_code_key"',
      }),
    ).toBe('이미 있는 회사코드입니다.')
    expect(publicErrorMessage({})).toBe('요청을 처리하지 못했습니다.')
    expect(publicErrorMessage(new Error('운영 관리자만 회사를 생성할 수 있습니다.'))).toBe(
      '운영 관리자만 회사를 생성할 수 있습니다.',
    )
    expect(publicErrorMessage({ code: 'invalid_credentials', message: 'Invalid login credentials' })).toBe(
      '이메일 또는 비밀번호가 올바르지 않습니다.',
    )
    expect(publicErrorMessage(new Error('Email not confirmed'))).toBe(
      '메일 확인이 끝나지 않았습니다. 스팸함도 보세요.',
    )
    expect(publicErrorMessage(new Error('User already registered'))).toBe(
      '이미 있는 계정입니다. 위 로그인으로 들어오세요.',
    )
    expect(publicErrorMessage(new Error('column foo does not exist'))).toBe('요청을 처리하지 못했습니다.')
    expect(publicErrorMessage(new Error('JWT expired'))).toBe('요청을 처리하지 못했습니다.')
  })
})
