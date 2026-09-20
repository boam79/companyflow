import { describe, expect, it } from 'vitest'
import { safeLoginNext } from './loginNext'

describe('로그인 다음 주소', () => {
  it('빈 QR 입력 주소만 통과하고 바깥 주소는 홈으로 보낸다', () => {
    const token = '11111111-1111-4111-8111-111111111111'
    expect(safeLoginNext(`/q/${token}`)).toBe(`/q/${token}`)
    expect(safeLoginNext('https://evil.example/q')).toBe('/')
    expect(safeLoginNext('//evil.example')).toBe('/')
    expect(safeLoginNext('/guest/q/' + token)).toBe('/')
    expect(safeLoginNext('/assets')).toBe('/')
    expect(safeLoginNext(null)).toBe('/')
  })
})
