import { describe, expect, it } from 'vitest'
import { missingRouteHomeHref, missingRouteHomeLabel, missingRouteLead } from './missingRoute'

describe('없는 주소 안내', () => {
  it('게스트와 업무 없는 주소를 한글로만 안내한다', () => {
    expect(missingRouteLead(false)).toBe('이 주소는 없습니다.')
    expect(missingRouteLead(true)).toBe('샘플에는 이 화면이 없습니다.')
    expect(missingRouteHomeHref(false)).toBe('/')
    expect(missingRouteHomeHref(true)).toBe('/guest')
    expect(missingRouteHomeLabel(false)).toBe('홈으로')
    expect(missingRouteHomeLabel(true)).toBe('샘플로')
    expect(missingRouteLead(false)).not.toMatch(/404|Not Found/)
  })
})
