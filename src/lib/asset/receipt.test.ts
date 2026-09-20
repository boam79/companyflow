import { describe, expect, it } from 'vitest'
import { COMPANY_ASSET_ITEMS, ISSUE_ITEMS, PAPER_ITEM } from '../master/book'
import { allocateReceiptQty, assetsFromReceipt } from './receipt'

describe('구매 수령 배분', () => {
  it('책상 2는 재고 없이 자산 2건이다', () => {
    expect(allocateReceiptQty(COMPANY_ASSET_ITEMS[0], 2)).toEqual({ warehouseQty: 0, assetQty: 2 })
    const assets = assetsFromReceipt('op-desk', 'item-desk', 'wh-main', 2, '2026-09-20T01:00:00.000Z', 'ord-desk')
    expect(assets).toHaveLength(2)
    expect(assets[0]).toMatchObject({
      id: 'op-desk:1',
      itemId: 'item-desk',
      locationText: '수령',
      acquiredAt: '2026-09-20',
      sourceOrderId: 'ord-desk',
      status: 'in_storage',
    })
    expect(assets[1].id).toBe('op-desk:2')
  })

  it('복사용지는 창고만 늘리고 명찰은 막는다', () => {
    expect(allocateReceiptQty(PAPER_ITEM, 10)).toEqual({ warehouseQty: 10, assetQty: 0 })
    expect(() => allocateReceiptQty(ISSUE_ITEMS[0], 1)).toThrow(/입퇴사/)
    expect(() => allocateReceiptQty(COMPANY_ASSET_ITEMS[0], 1.5)).toThrow(/정수/)
  })
})
