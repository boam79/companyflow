import { describe, expect, it } from 'vitest'
import {
  applyDraftContract,
  assertContractFile,
  base64ToBytes,
  bytesToBase64,
  contractAmountText,
  contractLife,
  contractPeriod,
  filterContracts,
} from './book'
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
    const first = applyDraftContract([], { ...BASE, fileHash: 'abc', fileName: 'lease.pdf' })
    expect(first.fileName).toBe('lease.pdf')
    expect(() => applyDraftContract([first], { ...BASE, id: 'con-2', fileHash: 'abc' })).toThrow(
      /같은 원본 파일/,
    )
  })

  it('원본은 PDF·PNG·JPEG 8MB까지 받는다', () => {
    expect(() => assertContractFile(9 * 1024 * 1024, 'application/pdf')).toThrow(/8MB/)
    expect(() => assertContractFile(12, 'text/plain')).toThrow(/PDF/)
    expect(assertContractFile(12, 'application/pdf')).toBe('application/pdf')
    expect(assertContractFile(12, 'image/png', 'scan.PNG')).toBe('image/png')
  })

  it('종료일이 시작일보다 빠르면 막힌다', () => {
    expect(() => applyDraftContract([], { ...BASE, startAt: '2026-09-17', endAt: '2026-09-01' })).toThrow(
      /종료일/,
    )
  })

  it('원본 바이트가 있으면 초안에 원본 있음으로 남긴다', () => {
    const bytes = new Uint8Array([1, 2, 3])
    const draft = applyDraftContract([], {
      ...BASE,
      fileName: 'lease.pdf',
      fileMime: 'application/pdf',
      fileHash: 'abc',
      fileBytes: bytes,
    })
    expect(draft.hasOriginal).toBe(true)
    expect(draft.fileMime).toBe('application/pdf')
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes)
  })

  it('공백만 있는 계약명·상대방과 음수 금액은 막힌다', () => {
    expect(() => applyDraftContract([], { ...BASE, title: '   ' })).toThrow(/계약명/)
    expect(() => applyDraftContract([], { ...BASE, counterparty: '\t' })).toThrow(/상대방/)
    expect(() => applyDraftContract([], { ...BASE, amount: -1 })).toThrow(/금액/)
  })

  it('목록은 번호·상대방·파일로 찾고 기간·금액을 보여 준다', () => {
    const rows = [
      applyDraftContract([], {
        ...BASE,
        contractNo: 'CON-2024-001',
        startAt: '2024-01-01',
        endAt: '2026-02-28',
        amount: 12000000,
        fileName: 'lease.pdf',
      }),
      applyDraftContract([], { ...BASE, id: 'con-2', title: '인터넷 전용회선', counterparty: 'KT' }),
    ]
    expect(filterContracts(rows, 'CON-2024')).toHaveLength(1)
    expect(filterContracts(rows, 'kt').map((row) => row.title)).toEqual(['인터넷 전용회선'])
    expect(contractPeriod(rows[0])).toBe('2024-01-01 ~ 2026-02-28')
    expect(contractAmountText(rows[0].amount)).toBe('12,000,000원')
    expect(contractLife('2026-02-28', '2026-09-19')).toBe('종료')
    expect(contractLife('2026-12-31', '2026-09-19')).toBe('진행')
  })

  it('OCR이 꺼져 있으면 후보 없이 직접 입력한다', async () => {
    const result = await DISABLED_OCR.extract({})
    expect(result.status).toBe('disabled')
    expect(result.candidates).toEqual([])
    expect(assertOcrCannotConfirm()).toBeUndefined()
  })
})
