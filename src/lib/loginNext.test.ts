import { describe, expect, it } from 'vitest'
import { afterSignOutHref, APP_ORIGIN, safeLoginNext, signupDoneMessage, signupEmailRedirectTo } from './loginNext'

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

  it('가입 확인 메일은 배포 로그인으로 돌아온다', () => {
    expect(signupEmailRedirectTo()).toBe(`${APP_ORIGIN}/login`)
    expect(signupDoneMessage()).toContain('위 로그인')
    expect(signupDoneMessage()).toContain('네이버')
  })

  it('로그아웃은 홈으로 돌아가 업무 화면을 비운다', () => {
    expect(afterSignOutHref()).toBe('/')
  })
})

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
