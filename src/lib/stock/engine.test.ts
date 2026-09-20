import { describe, expect, it } from 'vitest'
import {
  applyStockCommand,
  companyOnHand,
  createStockState,
  onHand,
  orderRemaining,
} from './engine'

const ITEM = 'item-paper'
const MAIN = 'wh-main'
const SUB = 'wh-sub'

describe('복사용지 재고 원장', () => {
  it('발주 10 → 수령 6+4 → 반출 3 → 반납 1 이면 현재고 8이다', () => {
    let state = createStockState()
    state = applyStockCommand(state, {
      type: 'confirm_order',
      operationId: 'op-order',
      orderId: 'ord-1',
      itemId: ITEM,
      qty: 10,
    }).state
    expect(companyOnHand(state, ITEM)).toBe(0)
    expect(orderRemaining(state, 'ord-1')).toBe(10)

    state = applyStockCommand(state, {
      type: 'post_receipt',
      operationId: 'op-recv-6',
      orderId: 'ord-1',
      itemId: ITEM,
      warehouseId: MAIN,
      qty: 6,
    }).state
    expect(orderRemaining(state, 'ord-1')).toBe(4)
    state = applyStockCommand(state, {
      type: 'post_receipt',
      operationId: 'op-recv-4',
      orderId: 'ord-1',
      itemId: ITEM,
      warehouseId: MAIN,
      qty: 4,
    }).state
    expect(onHand(state, ITEM, MAIN)).toBe(10)

    state = applyStockCommand(state, {
      type: 'post_issue',
      operationId: 'op-issue-3',
      itemId: ITEM,
      warehouseId: MAIN,
      qty: 3,
      personName: '김담당',
    }).state
    const returned = applyStockCommand(state, {
      type: 'post_return',
      operationId: 'op-return-1',
      itemId: ITEM,
      warehouseId: MAIN,
      qty: 1,
      sourceOperationId: 'op-issue-3',
    })
    state = returned.state
    expect(companyOnHand(state, ITEM)).toBe(8)
  })

  it('이동 후에도 회사 합계는 같고 같은 operation_id 는 한 번만 반영된다', () => {
    let state = createStockState()
    state = applyStockCommand(state, {
      type: 'post_direct_in',
      operationId: 'op-direct-8',
      itemId: ITEM,
      warehouseId: MAIN,
      qty: 8,
    }).state
    state = applyStockCommand(state, {
      type: 'transfer_stock',
      operationId: 'op-move-2',
      itemId: ITEM,
      fromWarehouseId: MAIN,
      toWarehouseId: SUB,
      qty: 2,
    }).state
    expect(onHand(state, ITEM, MAIN)).toBe(6)
    expect(onHand(state, ITEM, SUB)).toBe(2)
    expect(companyOnHand(state, ITEM)).toBe(8)

    const replay = applyStockCommand(state, {
      type: 'transfer_stock',
      operationId: 'op-move-2',
      itemId: ITEM,
      fromWarehouseId: MAIN,
      toWarehouseId: SUB,
      qty: 2,
    })
    expect(replay.status).toBe('duplicate')
    expect(companyOnHand(replay.state, ITEM)).toBe(8)
  })

  it('초안은 현재고에 넣지 않고, 반출은 성명 또는 부서가 필요하다', () => {
    let state = createStockState()
    state = applyStockCommand(state, {
      type: 'draft_order',
      operationId: 'op-draft',
      orderId: 'ord-d',
      itemId: ITEM,
      qty: 5,
    }).state
    expect(companyOnHand(state, ITEM)).toBe(0)
    expect(() =>
      applyStockCommand(state, {
        type: 'post_issue',
        operationId: 'op-bad-issue',
        itemId: ITEM,
        warehouseId: MAIN,
        qty: 1,
      }),
    ).toThrow(/성명 또는 부서/)
  })

  it('실사 조정과 정정은 원장으로만 현재고를 바꾼다', () => {
    let state = createStockState()
    state = applyStockCommand(state, {
      type: 'post_direct_in',
      operationId: 'op-in-5',
      itemId: ITEM,
      warehouseId: MAIN,
      qty: 5,
    }).state
    state = applyStockCommand(state, {
      type: 'adjust_stock',
      operationId: 'op-count',
      itemId: ITEM,
      warehouseId: MAIN,
      countedQty: 4,
      reason: '파손 확인',
    }).state
    expect(onHand(state, ITEM, MAIN)).toBe(4)

    state = applyStockCommand(state, {
      type: 'reverse_transaction',
      operationId: 'op-reverse',
      sourceOperationId: 'op-count',
    }).state
    expect(onHand(state, ITEM, MAIN)).toBe(5)
    expect(() =>
      applyStockCommand(state, {
        type: 'reverse_transaction',
        operationId: 'op-reverse-2',
        sourceOperationId: 'op-count',
      }),
    ).toThrow(/이미 정정/)
  })

  it('발주 확정은 공급사를 남기고 초안 공급사를 유지한다', () => {
    let state = createStockState()
    state = applyStockCommand(state, {
      type: 'draft_order',
      operationId: 'op-draft',
      orderId: 'ord-1',
      itemId: ITEM,
      qty: 10,
      partnerId: 'partner-mfp',
    }).state
    expect(state.orders.get('ord-1')?.partnerId).toBe('partner-mfp')

    state = applyStockCommand(state, {
      type: 'confirm_order',
      operationId: 'op-confirm',
      orderId: 'ord-1',
      itemId: ITEM,
      qty: 10,
    }).state
    expect(state.orders.get('ord-1')?.status).toBe('confirmed')
    expect(state.orders.get('ord-1')?.partnerId).toBe('partner-mfp')
  })

  it('발주 확정은 납기를 남기고 초안 납기를 유지한다', () => {
    let state = createStockState()
    state = applyStockCommand(state, {
      type: 'draft_order',
      operationId: 'op-draft-due',
      orderId: 'ord-due',
      itemId: ITEM,
      qty: 10,
      dueDate: '2026-09-27',
    }).state
    expect(state.orders.get('ord-due')?.dueDate).toBe('2026-09-27')

    state = applyStockCommand(state, {
      type: 'confirm_order',
      operationId: 'op-confirm-due',
      orderId: 'ord-due',
      itemId: ITEM,
      qty: 10,
    }).state
    expect(state.orders.get('ord-due')?.status).toBe('confirmed')
    expect(state.orders.get('ord-due')?.dueDate).toBe('2026-09-27')
  })

  it('발주 확정은 발주일을 남기고 초안 발주일을 유지한다', () => {
    let state = createStockState()
    state = applyStockCommand(state, {
      type: 'draft_order',
      operationId: 'op-draft-ordered',
      orderId: 'ord-ordered',
      itemId: ITEM,
      qty: 10,
      orderDate: '2026-09-20',
    }).state
    expect(state.orders.get('ord-ordered')?.orderDate).toBe('2026-09-20')

    state = applyStockCommand(state, {
      type: 'confirm_order',
      operationId: 'op-confirm-ordered',
      orderId: 'ord-ordered',
      itemId: ITEM,
      qty: 10,
    }).state
    expect(state.orders.get('ord-ordered')?.status).toBe('confirmed')
    expect(state.orders.get('ord-ordered')?.orderDate).toBe('2026-09-20')
  })

  it('발주 확정은 첨부를 남기고 초안 첨부를 유지한다', () => {
    let state = createStockState()
    state = applyStockCommand(state, {
      type: 'draft_order',
      operationId: 'op-draft-file',
      orderId: 'ord-file',
      itemId: ITEM,
      qty: 10,
      fileName: 'quote.png',
      fileMime: 'image/png',
      fileBase64: 'abc',
    }).state
    expect(state.orders.get('ord-file')?.fileName).toBe('quote.png')

    state = applyStockCommand(state, {
      type: 'confirm_order',
      operationId: 'op-confirm-file',
      orderId: 'ord-file',
      itemId: ITEM,
      qty: 10,
    }).state
    expect(state.orders.get('ord-file')?.status).toBe('confirmed')
    expect(state.orders.get('ord-file')?.fileName).toBe('quote.png')
    expect(state.orders.get('ord-file')?.fileBase64).toBe('abc')
  })

  it('발주 확정은 통화를 남기고 없으면 원이다', () => {
    let state = createStockState()
    state = applyStockCommand(state, {
      type: 'draft_order',
      operationId: 'op-draft-fx',
      orderId: 'ord-fx',
      itemId: ITEM,
      qty: 10,
      currency: 'USD',
    }).state
    expect(state.orders.get('ord-fx')?.currency).toBe('USD')

    state = applyStockCommand(state, {
      type: 'confirm_order',
      operationId: 'op-confirm-fx',
      orderId: 'ord-fx',
      itemId: ITEM,
      qty: 10,
    }).state
    expect(state.orders.get('ord-fx')?.currency).toBe('USD')

    state = applyStockCommand(createStockState(), {
      type: 'confirm_order',
      operationId: 'op-krw',
      orderId: 'ord-krw',
      itemId: ITEM,
      qty: 1,
    }).state
    expect(state.orders.get('ord-krw')?.currency).toBe('KRW')
  })

  it('한 발주서에 비품과 자산을 함께 넣고 품목별 잔량만 수령한다', () => {
    let state = createStockState()
    state = applyStockCommand(state, {
      type: 'confirm_order',
      operationId: 'op-mix',
      orderId: 'ord-mix',
      itemId: ITEM,
      qty: 10,
      lines: [
        { itemId: ITEM, qty: 10 },
        { itemId: 'item-desk', qty: 2 },
      ],
    }).state
    const order = state.orders.get('ord-mix')
    expect(order?.itemId).toBe(ITEM)
    expect(order?.qty).toBe(10)
    expect(order?.lines).toEqual([
      { itemId: ITEM, qty: 10 },
      { itemId: 'item-desk', qty: 2 },
    ])
    expect(orderRemaining(state, 'ord-mix')).toBe(12)
    expect(orderRemaining(state, 'ord-mix', ITEM)).toBe(10)
    expect(orderRemaining(state, 'ord-mix', 'item-desk')).toBe(2)

    state = applyStockCommand(state, {
      type: 'post_receipt',
      operationId: 'op-recv-paper',
      orderId: 'ord-mix',
      itemId: ITEM,
      warehouseId: MAIN,
      qty: 4,
    }).state
    expect(orderRemaining(state, 'ord-mix', ITEM)).toBe(6)
    expect(orderRemaining(state, 'ord-mix', 'item-desk')).toBe(2)
    expect(() =>
      applyStockCommand(state, {
        type: 'post_receipt',
        operationId: 'op-recv-too-many',
        orderId: 'ord-mix',
        itemId: ITEM,
        warehouseId: MAIN,
        qty: 7,
      }),
    ).toThrow(/잔량/)
  })

  it('같은 품목을 두 줄로 넣지 않는다', () => {
    expect(() =>
      applyStockCommand(createStockState(), {
        type: 'confirm_order',
        operationId: 'op-dup',
        orderId: 'ord-dup',
        itemId: ITEM,
        qty: 1,
        lines: [
          { itemId: ITEM, qty: 1 },
          { itemId: ITEM, qty: 2 },
        ],
      }),
    ).toThrow(/한 줄/)
  })

  it('가구 수령은 발주 잔량만 줄이고 현재고는 늘리지 않는다', () => {
    let state = createStockState()
    state = applyStockCommand(state, {
      type: 'confirm_order',
      operationId: 'op-desk-order',
      orderId: 'ord-desk',
      itemId: 'item-desk',
      qty: 2,
    }).state
    state = applyStockCommand(state, {
      type: 'post_receipt',
      operationId: 'op-desk-recv',
      orderId: 'ord-desk',
      itemId: 'item-desk',
      warehouseId: MAIN,
      qty: 2,
      directAsset: true,
    }).state
    expect(orderRemaining(state, 'ord-desk')).toBe(0)
    expect(onHand(state, 'item-desk', MAIN)).toBe(0)
    expect(companyOnHand(state, 'item-desk')).toBe(0)
  })
})
