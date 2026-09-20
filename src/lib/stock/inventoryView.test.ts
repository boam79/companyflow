import { describe, expect, it } from 'vitest'
import { COMPANY_ASSET_ITEMS, PAPER_ITEM } from '../master/book'
import { applyStockCommand, createStockState } from './engine'
import {
  buildAssetOrderList,
  buildSupplyInventory,
  buildSupplyOrderList,
  supplyItems,
  supplyOrderCsv,
} from './inventoryView'

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

describe('비품 발주 목록', () => {
  const items = [PAPER_ITEM, ...COMPANY_ASSET_ITEMS]
  const desk = COMPANY_ASSET_ITEMS.find((item) => item.id === 'item-desk')!

  it('복사용지 발주만 항목별로 모으고 책상 발주는 자산 목록으로 뺀다', () => {
    let state = createStockState()
    state = applyStockCommand(state, {
      type: 'confirm_order',
      operationId: 'op-paper',
      orderId: 'ord-paper',
      itemId: PAPER_ITEM.id,
      qty: 10,
    }).state
    state = applyStockCommand(state, {
      type: 'post_receipt',
      operationId: 'op-recv-6',
      orderId: 'ord-paper',
      itemId: PAPER_ITEM.id,
      warehouseId: 'wh-main',
      qty: 6,
    }).state
    state = applyStockCommand(state, {
      type: 'draft_order',
      operationId: 'op-desk',
      orderId: 'ord-desk',
      itemId: desk.id,
      qty: 2,
    }).state

    expect(buildSupplyOrderList(items, state)).toEqual([
      {
        orderId: 'ord-paper',
        itemId: PAPER_ITEM.id,
        itemName: '복사용지',
        orderedQty: 10,
        receivedQty: 6,
        remainingQty: 4,
        status: 'confirmed',
      },
    ])
    expect(buildAssetOrderList(items, state)).toEqual([
      {
        orderId: 'ord-desk',
        itemId: desk.id,
        itemName: '책상',
        orderedQty: 2,
        receivedQty: 0,
        remainingQty: 0,
        status: 'draft',
      },
    ])
  })

  it('목록 CSV는 한글 열 이름으로 발주 항목을 내보낸다', () => {
    let state = createStockState()
    state = applyStockCommand(state, {
      type: 'confirm_order',
      operationId: 'op-paper',
      orderId: 'ord-paper',
      itemId: PAPER_ITEM.id,
      qty: 10,
    }).state
    const csv = supplyOrderCsv(buildSupplyOrderList(items, state))
    expect(csv.startsWith('\uFEFF')).toBe(true)
    expect(csv).toContain('발주번호,품목,발주,수령,잔량,상태')
    expect(csv).toContain('ord-paper,복사용지,10,0,10,확정')
  })
})
