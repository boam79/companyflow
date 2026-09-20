import { describe, expect, it } from 'vitest'
import {
  assertBlankQrCount,
  assertBlankQrUrl,
  assertPngDataUrl,
  blankQrDataUrl,
  blankQrFileName,
  blankQrScanUrl,
  isQrLabelId,
  isQrScanPath,
  qrScanPath,
} from './qr'

const ORIGIN = 'https://companyflow-opal.vercel.app'
const LABEL = '11111111-1111-4111-8111-111111111111'

describe('빈 자산 QR', () => {
  it('자산번호 없이 스마트폰 입력 주소만 담는다', () => {
    expect(blankQrScanUrl(ORIGIN, LABEL)).toBe(`${ORIGIN}/q/${LABEL}`)
    expect(() => assertBlankQrUrl(`${ORIGIN}/q/${LABEL}`)).not.toThrow()
    expect(() => blankQrScanUrl(ORIGIN, 'AST-C269B67F-1')).toThrow(/표식/)
    expect(isQrLabelId(LABEL)).toBe(true)
    expect(isQrLabelId('not-a-token')).toBe(false)
    expect(() => assertBlankQrUrl('companyflow:asset:AST-C269B67F-1')).toThrow(/자산번호/)
    expect(() => assertBlankQrUrl(`${ORIGIN}/assets/AST-C269B67F-1`)).toThrow(/자산번호/)
    expect(() => assertBlankQrUrl(`${ORIGIN}/assets/${LABEL}`)).toThrow(/주소/)
  })

  it('게스트는 샘플 입력 주소만 담고 본사 /q 와 섞지 않는다', () => {
    expect(qrScanPath(LABEL, true)).toBe(`/guest/q/${LABEL}`)
    expect(blankQrScanUrl(ORIGIN, LABEL, true)).toBe(`${ORIGIN}/guest/q/${LABEL}`)
    expect(() => assertBlankQrUrl(`${ORIGIN}/guest/q/${LABEL}`)).not.toThrow()
    expect(isQrScanPath(`/guest/q/${LABEL}`)).toBe(true)
    expect(isQrScanPath(`/q/${LABEL}`)).toBe(true)
    expect(isQrScanPath('/guest/assets')).toBe(false)
    expect(() => assertBlankQrUrl(`${ORIGIN}/guest/assets/${LABEL}`)).toThrow(/주소/)
  })

  it('인쇄용 파일 이름을 빈 QR 순번으로 만든다', () => {
    expect(blankQrFileName(1)).toBe('빈QR-01.png')
    expect(assertBlankQrCount(10)).toBe(10)
    expect(() => assertBlankQrCount(0)).toThrow(/1~40/)
  })

  it('QR 그림 파일을 만든다', async () => {
    const url = await blankQrDataUrl(ORIGIN, LABEL)
    expect(url.startsWith('data:image/png')).toBe(true)
    expect(() => assertPngDataUrl('javascript:alert(1)')).toThrow(/그림/)
  })
})
