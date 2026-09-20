import { describe, expect, it } from 'vitest'
import { applyStockCommand, companyOnHand, createStockState, onHand, orderRemaining } from './engine'
import { applySuggestionChain, objectMarker, stockActionItemId, suggestNextStockForm } from './nextAction'
import { COMPANY_ASSET_ITEMS, PAPER_ITEM } from '../master/book'

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

  it('가구 발주 잔량은 수령하면 자산이 된다고 안내한다', () => {
    const desk = {
      id: 'item-desk',
      name: '책상',
      stockManaged: false,
      assetManaged: true,
    }
    let state = applyStockCommand(createStockState(), {
      type: 'confirm_order',
      operationId: 'op-desk-order',
      orderId: 'ord-desk',
      itemId: 'item-desk',
      qty: 2,
    }).state
    expect(suggestNextStockForm(state, 'ord-desk', desk)).toMatchObject({
      action: 'post_receipt',
      qty: '2',
      hint: '발주 잔량 2 중 2개를 수령하면 개별 자산으로 등록됩니다.',
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
      itemId: ITEM,
      sourceOperationId: 'op-issue-4',
      hint: '반출에 이어 반납 1을 확정하면 입고로 돌아옵니다.',
    })
  })

  it('반납 뒤에는 비품을 창고로 옮기지 않는다', () => {
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

    expect(suggestNextStockForm(state, 'ord-paper')).toBeNull()
  })

  it('이동까지 끝나면 복사용지는 자산화하지 않는다', () => {
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

  it('수령 6·반출 4 상태에서 이어서 처리하면 잔량 0·회사 7이다', () => {
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

    let n = 0
    state = applySuggestionChain(
      state,
      {
        orderId: 'ord-paper',
        itemId: ITEM,
        warehouseId: MAIN,
        fromWarehouseId: MAIN,
        toWarehouseId: SUB,
      },
      () => `op-chain-${n++}`,
    )

    expect(orderRemaining(state, 'ord-paper')).toBe(0)
    expect(companyOnHand(state, ITEM)).toBe(7)
    expect(onHand(state, ITEM, MAIN)).toBe(7)
    expect(suggestNextStockForm(state, 'ord-paper')).toBeNull()
  })
})

describe('반출 품목', () => {
  it('반출·출고는 책상 대신 비품을 고른다', () => {
    const items = [PAPER_ITEM, ...COMPANY_ASSET_ITEMS]
    expect(stockActionItemId('post_issue', 'item-desk', items)).toBe('item-paper')
    expect(stockActionItemId('post_outbound', 'item-desk', items)).toBe('item-paper')
    expect(stockActionItemId('post_receipt', 'item-desk', items)).toBe('item-desk')
    expect(stockActionItemId('post_issue', 'item-paper', items)).toBe('item-paper')
  })
})
