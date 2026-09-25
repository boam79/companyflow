import { describe, expect, it } from 'vitest'
import { assetsEmptyLead, assetsInboxHeading, assetsListHeading, assetsMissingQrHint, assetsPageLead } from './empty'

describe('자산 빈 화면 안내', () => {
  it('업무 자산 안내는 본사 복사용지·샘플 책상을 말하지 않는다', () => {
    expect(assetsPageLead(false)).toContain('빈 QR')
    expect(assetsPageLead(false)).not.toMatch(/복사용지/)
    expect(assetsPageLead(true)).toContain('샘플')
    expect(assetsEmptyLead()).toContain('빈 QR')
    expect(assetsInboxHeading(false, 0)).toBe('스마트폰에서 저장')
    expect(assetsInboxHeading(false, 3)).toBe('스마트폰에서 저장 3')
    expect(assetsListHeading(0)).toBe('회사 자산')
    expect(assetsListHeading(2)).toBe('회사 자산 2')
    expect(assetsMissingQrHint(false)).toContain('빈 QR')
    expect(assetsMissingQrHint(false)).not.toMatch(/샘플|견본/)
    expect(assetsMissingQrHint(true)).toContain('견본')
  })
})
