import { describe, expect, it } from 'vitest'
import { applyDraftContract } from './book'
import { DISABLED_OCR, assertOcrCannotConfirm } from './ocr'

const BASE = {
  id: 'con-1',
  title: '본사 임대',
  counterparty: '한국임대',
}

describe('계약 초안', () => {
  it('직접 입력으로 초안만 만들고 체결하지 않는다', () => {
    const draft = applyDraftContract([], BASE)
    expect(draft).toMatchObject({
      title: '본사 임대',
      counterparty: '한국임대',
      status: 'draft',
      ocrStatus: 'off',
      currency: 'KRW',
    })
  })

  it('같은 원본 해시는 계약을 한 번만 만든다', () => {
    const first = applyDraftContract([], { ...BASE, fileHash: 'abc' })
    expect(() => applyDraftContract([first], { ...BASE, id: 'con-2', fileHash: 'abc' })).toThrow(
      /같은 원본 파일/,
    )
  })

  it('종료일이 시작일보다 빠르면 막힌다', () => {
    expect(() => applyDraftContract([], { ...BASE, startAt: '2026-09-17', endAt: '2026-09-01' })).toThrow(
      /종료일/,
    )
  })

  it('OCR이 꺼져 있으면 후보 없이 직접 입력한다', async () => {
    const result = await DISABLED_OCR.extract({})
    expect(result.status).toBe('disabled')
    expect(result.candidates).toEqual([])
    expect(assertOcrCannotConfirm()).toBeUndefined()
  })
})
