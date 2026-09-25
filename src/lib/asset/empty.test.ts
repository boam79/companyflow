import { describe, expect, it } from 'vitest'
import { assetsEmptyLead, assetsMissingQrHint, assetsPageLead } from './empty'

describe('자산 빈 화면 안내', () => {
  it('업무 자산 안내는 본사 복사용지·샘플 책상을 말하지 않는다', () => {
    expect(assetsPageLead(false)).toContain('빈 QR')
    expect(assetsPageLead(false)).not.toMatch(/복사용지/)
    expect(assetsPageLead(true)).toContain('샘플')
    expect(assetsEmptyLead()).toContain('빈 QR')
    expect(assetsMissingQrHint(false)).toContain('빈 QR')
    expect(assetsMissingQrHint(false)).not.toMatch(/샘플|견본/)
    expect(assetsMissingQrHint(true)).toContain('견본')
  })
})
