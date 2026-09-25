import { describe, expect, it } from 'vitest'
import { afterSignOutHref, APP_ORIGIN, loginContinueLabel, loginPageLead, qrLoginHref, safeLoginNext, signupDoneMessage, signupEmailRedirectTo } from './loginNext'

describe('로그인 다음 주소', () => {
  it('빈 QR 입력 주소만 통과하고 바깥 주소는 홈으로 보낸다', () => {
    const token = '11111111-1111-4111-8111-111111111111'
    expect(safeLoginNext(`/q/${token}`)).toBe(`/q/${token}`)
    expect(safeLoginNext('https://evil.example/q')).toBe('/')
    expect(safeLoginNext('//evil.example')).toBe('/')
    expect(safeLoginNext('/guest/q/' + token)).toBe('/')
    expect(safeLoginNext('/assets')).toBe('/')
    expect(safeLoginNext('/ops/companies')).toBe('/')
    expect(safeLoginNext('/q/11111111-1111-4111-8111-111111111111/extra')).toBe('/')
    expect(safeLoginNext(null)).toBe('/')
    expect(qrLoginHref(token)).toBe(`/login?next=${encodeURIComponent(`/q/${token}`)}`)
    expect(qrLoginHref('not-a-token')).toBe('/login?next=%2F')
    expect(qrLoginHref('../ops/companies')).toBe('/login?next=%2F')
  })

  it('가입 확인 메일은 배포 로그인으로 돌아온다', () => {
    expect(signupEmailRedirectTo()).toBe(`${APP_ORIGIN}/login`)
    expect(signupDoneMessage()).toContain('위 로그인')
    expect(signupDoneMessage()).toContain('스팸함')
    expect(signupDoneMessage()).not.toMatch(/네이버/)
    expect(loginPageLead()).toBe('계정이 없으면 아래 회원가입에서 만듭니다.')
    expect(loginPageLead()).not.toMatch(/app_metadata|운영 권한/)
    expect(loginContinueLabel('/')).toBe('홈으로')
    expect(loginContinueLabel('/q/11111111-1111-4111-8111-111111111111')).toBe('이어서')
  })

  it('로그아웃은 홈으로 돌아가 업무 화면을 비운다', () => {
    expect(afterSignOutHref()).toBe('/')
  })
})
