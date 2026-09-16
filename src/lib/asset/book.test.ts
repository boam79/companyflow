import { describe, expect, it } from 'vitest'
import { applyStockCommand, companyOnHand, createStockState, onHand } from '../stock/engine'
import { assetIdsForConvert, assetsFromConvert } from './book'

const ITEM = 'item-paper'
const MAIN = 'wh-main'

describe('재고 자산화', () => {
  it('2개를 자산화하면 현재고는 줄고 자산 수는 2다', () => {
    let state = createStockState()
    state = applyStockCommand(state, {
      type: 'post_direct_in',
      operationId: 'op-in',
      itemId: ITEM,
      warehouseId: MAIN,
      qty: 7,
    }).state
    state = applyStockCommand(state, {
      type: 'convert_to_asset',
      operationId: 'op-asset',
      itemId: ITEM,
      warehouseId: MAIN,
      qty: 2,
    }).state
    expect(onHand(state, ITEM, MAIN)).toBe(5)
    expect(companyOnHand(state, ITEM)).toBe(5)
    expect(assetIdsForConvert('op-asset', 2)).toEqual(['op-asset:1', 'op-asset:2'])
    expect(assetsFromConvert('op-asset', ITEM, MAIN, 2, 't').map((row) => row.status)).toEqual([
      'in_storage',
      'in_storage',
    ])
  })
})
