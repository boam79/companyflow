import { describe, expect, it, vi } from 'vitest'
import { isImeComposing, preventImeEnterSubmit } from './hangulIme'

describe('한글 조합 중 Enter', () => {
  it('조합 중인 Enter는 저장하지 않는다', () => {
    expect(isImeComposing({ isComposing: true })).toBe(true)
    expect(isImeComposing({ keyCode: 229 })).toBe(true)
    expect(isImeComposing({ nativeEvent: { isComposing: true } })).toBe(true)
    const preventDefault = vi.fn()
    expect(preventImeEnterSubmit({ key: 'Enter', isComposing: true, preventDefault })).toBe(true)
    expect(preventDefault).toHaveBeenCalledTimes(1)
  })

  it('조합이 끝난 Enter는 막지 않는다', () => {
    expect(isImeComposing({ isComposing: false, keyCode: 13 })).toBe(false)
    const preventDefault = vi.fn()
    expect(preventImeEnterSubmit({ key: 'Enter', isComposing: false, preventDefault })).toBe(false)
    expect(preventImeEnterSubmit({ key: 'a', isComposing: true, preventDefault })).toBe(false)
    expect(preventDefault).not.toHaveBeenCalled()
  })
})
