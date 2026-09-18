import { describe, expect, it } from 'vitest'
import { describeOcrResult } from './ocr'

describe('OCR 안내 문구', () => {
  it('글자가 없으면 폼에서 직접 넣으라고 한다', () => {
    expect(describeOcrResult({ text: '', candidateCount: 0 })).toMatch(/글자를 찾지 못했습니다/)
  })

  it('그림을 못 열면 영어 오류 대신 다시 저장하라고 한다', () => {
    expect(describeOcrResult({ error: 'Error attempting to read image.', text: '', candidateCount: 0 })).toMatch(
      /PNG 또는 JPEG/,
    )
  })

  it('글자만 있고 칸 값이 없으면 아래를 보라고 한다', () => {
    expect(describeOcrResult({ text: '청소 용역', candidateCount: 0 })).toMatch(/칸에 넣을 값/)
  })
})
