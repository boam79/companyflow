import { describe, expect, it } from 'vitest'
import { assetNumber } from './book'
import { assetQrDataUrl, assetQrFileName, assetQrPayload } from './qr'

describe('자산 QR', () => {
  it('자산번호로 붙일 QR 내용을 만든다', () => {
    const number = assetNumber('c269b67f-c44f-4015-9e3a-86af05a45077:1')
    expect(assetQrPayload(number)).toBe('companyflow:asset:AST-C269B67F-1')
    expect(assetQrFileName(number)).toBe('AST-C269B67F-1.png')
  })

  it('QR 그림 파일을 만든다', async () => {
    const url = await assetQrDataUrl('AST-C269B67F-1')
    expect(url.startsWith('data:image/png')).toBe(true)
  })
})
