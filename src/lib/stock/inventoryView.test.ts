import { describe, expect, it } from 'vitest'
import { COMPANY_ASSET_ITEMS, PAPER_ITEM } from '../master/book'
import { applyStockCommand, createStockState } from './engine'
import { buildSupplyInventory, supplyItems } from './inventoryView'

const WAREHOUSES = [
  { id: 'wh-main', name: '본사창고' },
  { id: 'wh-sub', name: '부속창고' },
]

describe('비품 현재고', () => {
  it('책상·컴퓨터는 재고 표에서 빼고 복사용지만 한 줄로 모은다', () => {
    let state = createStockState()
    state = applyStockCommand(state, {
      type: 'post_direct_in',
      operationId: 'in-main',
      itemId: PAPER_ITEM.id,
      warehouseId: 'wh-main',
      qty: 5,
    }).state
    state = applyStockCommand(state, {
      type: 'post_direct_in',
      operationId: 'in-sub',
      itemId: PAPER_ITEM.id,
      warehouseId: 'wh-sub',
      qty: 2,
    }).state

    const items = [PAPER_ITEM, ...COMPANY_ASSET_ITEMS]
    expect(supplyItems(items).map((item) => item.id)).toEqual(['item-paper'])
    expect(buildSupplyInventory(items, WAREHOUSES, state)).toEqual([
      {
        itemId: 'item-paper',
        itemName: '복사용지',
        quantities: [5, 2],
        total: 7,
      },
    ])
  })
})
