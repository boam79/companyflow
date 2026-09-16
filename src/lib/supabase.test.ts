import { describe, expect, it } from 'vitest'
import { isPlatformOperator, operatorFromUser } from './supabase'

describe('운영 권한은 app_metadata만 본다', () => {
  it('platform_operator true 만 운영자로 본다', () => {
    expect(isPlatformOperator({ platform_operator: true })).toBe(true)
    expect(isPlatformOperator({ platform_operator: false })).toBe(false)
    expect(isPlatformOperator({ platform_operator: 'true' })).toBe(false)
    expect(isPlatformOperator(undefined)).toBe(false)
  })

  it('user_metadata 의 자가 승격 표시는 무시한다', () => {
    expect(
      operatorFromUser({
        app_metadata: {},
        user_metadata: { platform_operator: true },
      }),
    ).toBe(false)
    expect(
      operatorFromUser({
        app_metadata: { platform_operator: true },
        user_metadata: {},
      }),
    ).toBe(true)
  })
})
