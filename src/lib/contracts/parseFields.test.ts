import { describe, expect, it } from 'vitest'
import { applyOcrCandidates, parseContractText, toIsoDate } from './parseFields'

const SAMPLE = `임대차 계약서
계약명 본사 3층 임대
계약번호 CON-2024-001
상대방 한국임대
담당자 김담당
체결일 2024년 1월 2일
시작일 2024-01-01
종료일 2026.12.31
계약금액 12,000,000원
`

describe('계약 OCR 필드 추출', () => {
  it('한글 날짜를 ISO로 바꾼다', () => {
    expect(toIsoDate('2024년 1월 2일')).toBe('2024-01-02')
    expect(toIsoDate('2026.12.31')).toBe('2026-12-31')
  })

  it('인쇄된 계약 문구에서 번호·상대방·금액·기간을 뽑는다', () => {
    const found = Object.fromEntries(parseContractText(SAMPLE).map((row) => [row.field, row.value]))
    expect(found).toMatchObject({
      title: '본사 3층 임대',
      contractNo: 'CON-2024-001',
      counterparty: '한국임대',
      ownerName: '김담당',
      signedAt: '2024-01-02',
      startAt: '2024-01-01',
      endAt: '2026-12-31',
      amount: '12000000',
    })
  })

  it('한 줄 영문 PDF 텍스트에서도 번호만 자른다', () => {
    const found = Object.fromEntries(
      parseContractText(
        'Contract title HQ 3F lease Contract No CON-OCR-01 Counterparty Hanguk Lease Amount 1500000',
      ).map((row) => [row.field, row.value]),
    )
    expect(found.contractNo).toBe('CON-OCR-01')
    expect(found.counterparty).toBe('Hanguk Lease')
    expect(found.amount).toBe('1500000')
    expect(found.title).toMatch(/HQ 3F lease/i)
  })
  it('한글을 한 글자씩 떨어뜨린 OCR도 칸을 채운다', () => {
    const found = Object.fromEntries(
      parseContractText(`계 약 명 본 사 3 층 임 대
계 약 번 호 CON-OCR-PNG-02
상 대 방 한 국 리 스
담 당 자 김 담 당
체 결 일 2026년 9월 19일
계 약 금 액 2500000원`).map((row) => [row.field, row.value]),
    )
    expect(found.contractNo).toBe('CON-OCR-PNG-02')
    expect(found.counterparty).toBe('한국리스')
    expect(found.ownerName).toBe('김담당')
    expect(found.title).toMatch(/본사/)
    expect(found.amount).toBe('2500000')
    expect(found.signedAt).toBe('2026-09-19')
  })

  it('계약금액 줄을 계약명으로 쓰지 않는다', () => {
    const found = Object.fromEntries(
      parseContractText('계약번호 CON-X-1\n계약금액 2500000원').map((row) => [row.field, row.value]),
    )
    expect(found.title).toBeUndefined()
    expect(found.amount).toBe('2500000')
  })

  it('OCR 후보로 칸을 채운다', () => {
    const filled = applyOcrCandidates(
      {
        title: '',
        contractNo: '',
        counterparty: '',
        signedAt: '2026-09-19',
        startAt: '2026-09-19',
        endAt: '',
        amount: '',
        ownerName: '',
      },
      parseContractText(SAMPLE),
    )
    expect(filled.title).toBe('본사 3층 임대')
    expect(filled.contractNo).toBe('CON-2024-001')
    expect(filled.signedAt).toBe('2024-01-02')
    expect(filled.startAt).toBe('2024-01-01')
    expect(filled.endAt).toBe('2026-12-31')
    expect(filled.amount).toBe('12000000')
  })
})
