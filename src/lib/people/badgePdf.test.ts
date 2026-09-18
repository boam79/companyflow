import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import {
  filledBadgeFileName,
  nameplatePageSizePts,
  ptsToMm,
  wrapImageAsNameplatePdf,
} from './badgePdf'

const TINY_PNG = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='),
  (char) => char.charCodeAt(0),
)

describe('명찰 PDF', () => {
  it('재단 페이지를 템플릿 포인트 크기로 둔다', () => {
    expect(nameplatePageSizePts({ width: 320, height: 96 }, 1.6)).toEqual({ width: 200, height: 60 })
    expect(ptsToMm(72)).toBeCloseTo(25.4)
  })

  it('받은 파일 이름에 명찰 이름을 넣는다', () => {
    expect(filledBadgeFileName({ name: '박 재 민' })).toBe('명찰-박재민.pdf')
  })

  it('PDF 페이지가 명찰 실제 크기이다', async () => {
    const bytes = await wrapImageAsNameplatePdf(TINY_PNG, 180, 48)
    const pdf = await PDFDocument.load(bytes)
    const page = pdf.getPage(0)
    expect(page.getWidth()).toBeCloseTo(180)
    expect(page.getHeight()).toBeCloseTo(48)
  })
})
