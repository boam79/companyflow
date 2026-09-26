import { describe, expect, it } from 'vitest'
import { PDFJS_SAFE_OPTIONS } from './pdfjsSafe'

describe('계약 PDF는 스크립트를 켜지 않는다', () => {
  it('악성 PDF 스크립트와 eval을 끈다', () => {
    expect(PDFJS_SAFE_OPTIONS.enableScripting).toBe(false)
    expect(PDFJS_SAFE_OPTIONS.isEvalSupported).toBe(false)
    expect(PDFJS_SAFE_OPTIONS.useWorkerFetch).toBe(false)
  })
})
