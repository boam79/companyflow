import { describe, expect, it } from 'vitest'
import {
  DISABLED_OCR,
  describeOcrResult,
  ocrEvidenceLine,
  ocrFailedMessage,
  ocrJobCaption,
  ocrJobStatus,
  ocrRetryLabel,
  parseOcrFieldsJson,
} from './ocr'
import { formValueForOcrField, reviewedOcrFields } from './parseFields'

describe('OCR 안내 문구', () => {
  it('글자가 없으면 폼에서 직접 넣으라고 한다', () => {
    expect(describeOcrResult({ text: '', candidateCount: 0 })).toMatch(/다시 읽거나/)
    expect(describeOcrResult({ text: '', candidateCount: 0 })).toMatch(/원본은 그대로/)
  })

  it('그림을 못 열면 영어 오류 대신 다시 저장하라고 한다', () => {
    expect(describeOcrResult({ error: 'Error attempting to read image.', text: '', candidateCount: 0 })).toMatch(
      /PNG 또는 JPEG/,
    )
    expect(describeOcrResult({ error: 'Error attempting to read image.', text: '', candidateCount: 0 })).toMatch(
      /다시 읽거나/,
    )
  })

  it('글자만 있고 칸 값이 없으면 아래를 보라고 한다', () => {
    expect(describeOcrResult({ text: '청소 용역', candidateCount: 0 })).toMatch(/칸에 넣을 값/)
  })

  it('꺼진 OCR은 아직이라고 하지 않는다', async () => {
    const result = await DISABLED_OCR.extract({})
    expect(result.message).toContain('OCR이 꺼져 있습니다')
    expect(result.message).not.toMatch(/아직/)
  })

  it('인식 신뢰도와 확인한 값을 구분한다', () => {
    expect(
      ocrEvidenceLine({
        field: 'title',
        value: '본사 임대',
        confidence: 0.6,
        page: 1,
        sourceText: '계약명 본사 임대',
        reviewedValue: '본사 3층 임대',
      }),
    ).toBe('계약명 · 인식 60% · 1쪽 · 계약명 본사 임대 · 확인 본사 3층 임대')
    expect(ocrRetryLabel()).toBe('다시 읽기')
    expect(ocrJobCaption(ocrJobStatus({ busy: true, failed: false, candidateCount: 0, reviewed: false }))).toBe(
      '처리 중',
    )
    expect(ocrJobCaption(ocrJobStatus({ busy: false, failed: true, candidateCount: 0, reviewed: true }))).toBe('실패')
    expect(ocrFailedMessage('OCR을 끝내지 못했습니다. 다시 읽거나 직접 입력하세요.')).toBe(true)
    expect(ocrJobCaption('idle')).toBe('')
  })

  it('저장된 JSON에서 필드 근거를 읽는다', () => {
    const rows = parseOcrFieldsJson(
      JSON.stringify([{ field: 'amount', value: '12000000', confidence: 0.8, page: 2, reviewedValue: '12000000' }]),
    )
    expect(rows).toEqual([
      { field: 'amount', value: '12000000', confidence: 0.8, page: 2, sourceText: undefined, reviewedValue: '12000000' },
    ])
    expect(parseOcrFieldsJson('not-json')).toEqual([])
  })

  it('칸을 고치면 확인한 값을 붙인다', () => {
    const form = {
      title: '본사 3층 임대',
      contractNo: 'CON-1',
      counterparty: '한국임대',
      signedAt: '2024-01-02',
      startAt: '2024-01-01',
      endAt: '2026-12-31',
      amount: '1',
      ownerName: '김담당',
    }
    expect(formValueForOcrField(form, 'title')).toBe('본사 3층 임대')
    expect(reviewedOcrFields([{ field: 'title', value: '본사 임대', confidence: 0.6 }], form)[0].reviewedValue).toBe(
      '본사 3층 임대',
    )
  })
})
