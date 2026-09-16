import { describe, expect, it } from 'vitest'
import { applyStockCommand, createStockState } from './engine'
import { objectMarker, suggestNextStockForm } from './nextAction'

const ITEM = 'item-paper'
const MAIN = 'wh-main'
const SUB = 'wh-sub'

function paperState() {
  return applyStockCommand(createStockState(), {
    type: 'confirm_order',
    operationId: 'op-order',
    orderId: 'ord-paper',
    itemId: ITEM,
    qty: 10,
  }).state
}

describe('다음 재고 거래', () => {
  it('4는 를, 6과 10은 을을 붙인다', () => {
    expect(objectMarker(4)).toBe('를')
    expect(objectMarker(6)).toBe('을')
    expect(objectMarker(10)).toBe('을')
  })

  it('수령 6·반출 4여도 발주 잔량 4가 있으면 다음 거래는 수령이다', () => {
    let state = paperState()
    state = applyStockCommand(state, {
      type: 'post_receipt',
      operationId: 'op-recv-6',
      orderId: 'ord-paper',
      itemId: ITEM,
      warehouseId: MAIN,
      qty: 6,
    }).state
    state = applyStockCommand(state, {
      type: 'post_issue',
      operationId: 'op-issue-4',
      itemId: ITEM,
      warehouseId: MAIN,
      qty: 4,
      personName: '김담당',
    }).state

    expect(suggestNextStockForm(state, 'ord-paper')).toMatchObject({
      action: 'post_receipt',
      qty: '4',
      hint: '발주 잔량 4 중 4를 수령하면 수불부에 입고로 이어집니다.',
    })
  })

  it('잔량 수령 뒤에는 반출 원거래로 반납 1을 맞춘다', () => {
    let state = paperState()
    state = applyStockCommand(state, {
      type: 'post_receipt',
      operationId: 'op-recv-6',
      orderId: 'ord-paper',
      itemId: ITEM,
      warehouseId: MAIN,
      qty: 6,
    }).state
    state = applyStockCommand(state, {
      type: 'post_issue',
      operationId: 'op-issue-4',
      itemId: ITEM,
      warehouseId: MAIN,
      qty: 4,
      personName: '김담당',
    }).state
    state = applyStockCommand(state, {
      type: 'post_receipt',
      operationId: 'op-recv-4',
      orderId: 'ord-paper',
      itemId: ITEM,
      warehouseId: MAIN,
      qty: 4,
    }).state

    expect(suggestNextStockForm(state, 'ord-paper')).toEqual({
      action: 'post_return',
      qty: '1',
      sourceOperationId: 'op-issue-4',
      hint: '반출에 이어 반납 1을 확정하면 입고로 돌아옵니다.',
    })
  })

  it('반납 뒤에는 창고 이동 2를 맞춘다', () => {
    let state = paperState()
    state = applyStockCommand(state, {
      type: 'post_receipt',
      operationId: 'op-recv-10',
      orderId: 'ord-paper',
      itemId: ITEM,
      warehouseId: MAIN,
      qty: 10,
    }).state
    state = applyStockCommand(state, {
      type: 'post_issue',
      operationId: 'op-issue-4',
      itemId: ITEM,
      warehouseId: MAIN,
      qty: 4,
      personName: '김담당',
    }).state
    state = applyStockCommand(state, {
      type: 'post_return',
      operationId: 'op-return-1',
      itemId: ITEM,
      warehouseId: MAIN,
      qty: 1,
      sourceOperationId: 'op-issue-4',
    }).state

    expect(suggestNextStockForm(state, 'ord-paper')).toMatchObject({
      action: 'transfer_stock',
      qty: '2',
    })
  })

  it('이동까지 끝나면 다음 거래를 비운다', () => {
    let state = paperState()
    state = applyStockCommand(state, {
      type: 'post_receipt',
      operationId: 'op-recv-10',
      orderId: 'ord-paper',
      itemId: ITEM,
      warehouseId: MAIN,
      qty: 10,
    }).state
    state = applyStockCommand(state, {
      type: 'transfer_stock',
      operationId: 'op-move-2',
      itemId: ITEM,
      fromWarehouseId: MAIN,
      toWarehouseId: SUB,
      qty: 2,
    }).state

    expect(suggestNextStockForm(state, 'ord-paper')).toBeNull()
  })
})
