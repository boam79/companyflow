import { describe, expect, it } from 'vitest'
import {
  applyStockCommand,
  companyOnHand,
  createStockState,
  inboundReturnBalance,
  ledgerCatalogFields,
  onHand,
  orderRemaining,
  returnBalance,
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

  it('반납은 원반출 수량을 넘지 못한다', () => {
    let state = createStockState()
    state = applyStockCommand(state, {
      type: 'post_direct_in',
      operationId: 'op-in-5',
      itemId: ITEM,
      warehouseId: MAIN,
      qty: 5,
    }).state
    state = applyStockCommand(state, {
      type: 'post_issue',
      operationId: 'op-issue-2',
      itemId: ITEM,
      warehouseId: MAIN,
      qty: 2,
      personName: '견본 김대리',
    }).state
    expect(returnBalance(state.ledger, 'op-issue-2')).toEqual({ issued: 2, already: 0, left: 2 })
    state = applyStockCommand(state, {
      type: 'post_return',
      operationId: 'op-return-2',
      itemId: ITEM,
      warehouseId: MAIN,
      qty: 2,
      sourceOperationId: 'op-issue-2',
      memo: '견본 반납 메모',
      fileName: '견본반납.png',
      recordedBy: '박재민',
    }).state
    expect(returnBalance(state.ledger, 'op-issue-2')).toEqual({ issued: 2, already: 2, left: 0 })
    expect(state.ledger.at(-1)).toMatchObject({
      txnType: 'return',
      memo: '견본 반납 메모',
      fileName: '견본반납.png',
      recordedBy: '박재민',
    })
    expect(() =>
      applyStockCommand(state, {
        type: 'post_return',
        operationId: 'op-return-extra',
        itemId: ITEM,
        warehouseId: MAIN,
        qty: 1,
        sourceOperationId: 'op-issue-2',
      }),
    ).toThrow(/반출 수량을 초과해 반납할 수 없습니다/)
  })

  it('직접 입고는 발주를 만들지 않고 현재고만 늘린다', () => {
    const state = applyStockCommand(createStockState(), {
      type: 'post_direct_in',
      operationId: 'op-direct-1',
      itemId: ITEM,
      warehouseId: MAIN,
      qty: 3,
    }).state
    expect(state.orders.size).toBe(0)
    expect(onHand(state, ITEM, MAIN)).toBe(3)
  })

  it('직접 입고 공급사·사유는 선택이고 발주는 만들지 않는다', () => {
    const state = applyStockCommand(createStockState(), {
      type: 'post_direct_in',
      operationId: 'op-direct-note',
      itemId: ITEM,
      warehouseId: MAIN,
      qty: 2,
      partnerId: 'partner-guest',
      purpose: '샘플 보충',
      businessDate: '2026-10-01',
      memo: '샘플 메모',
      fileName: '견본입고.png',
      fileMime: 'image/png',
      fileBase64: 'abcd',
    }).state
    expect(state.orders.size).toBe(0)
    expect(state.ledger[0]).toMatchObject({
      txnType: 'direct_in',
      partnerId: 'partner-guest',
      purpose: '샘플 보충',
      businessDate: '2026-10-01',
      memo: '샘플 메모',
      fileName: '견본입고.png',
    })
    expect(state.ledger[0].fileBase64).toBe('abcd')
    expect(onHand(state, ITEM, MAIN)).toBe(2)
    expect(() =>
      applyStockCommand(createStockState(), {
        type: 'post_direct_in',
        operationId: 'op-direct-file',
        itemId: ITEM,
        warehouseId: MAIN,
        qty: 1,
        fileBase64: 'abcd',
      }),
    ).toThrow(/첨부 이름/)
  })

  it('반출 목적과 반납 예정일은 남긴다', () => {
    let state = createStockState()
    state = applyStockCommand(state, {
      type: 'post_direct_in',
      operationId: 'op-in-issue-note',
      itemId: ITEM,
      warehouseId: MAIN,
      qty: 2,
    }).state
    state = applyStockCommand(state, {
      type: 'post_issue',
      operationId: 'op-issue-note',
      itemId: ITEM,
      warehouseId: MAIN,
      qty: 1,
      personName: '견본 김대리',
      purpose: '샘플 청소',
      dueReturnAt: '2026-10-10',
      fileName: '견본반출.png',
    }).state
    expect(state.ledger.at(-1)).toMatchObject({
      txnType: 'issue',
      personName: '견본 김대리',
      purpose: '샘플 청소',
      dueReturnAt: '2026-10-10',
      fileName: '견본반출.png',
    })
  })

  it('출고는 현재고를 줄이고 잔량을 넘지 못한다', () => {
    let state = createStockState()
    state = applyStockCommand(state, {
      type: 'post_direct_in',
      operationId: 'op-in-4',
      itemId: ITEM,
      warehouseId: MAIN,
      qty: 4,
    }).state
    state = applyStockCommand(state, {
      type: 'post_outbound',
      operationId: 'op-out-1',
      itemId: ITEM,
      warehouseId: MAIN,
      qty: 1,
    }).state
    expect(onHand(state, ITEM, MAIN)).toBe(3)
    state = applyStockCommand(state, {
      type: 'post_outbound',
      operationId: 'op-out-note',
      itemId: ITEM,
      warehouseId: MAIN,
      qty: 1,
      memo: '샘플 출고 메모',
      recordedBy: '박재민',
      purpose: '샘플 출고',
      fileName: '견본출고.png',
    }).state
    expect(state.ledger.at(-1)).toMatchObject({
      txnType: 'outbound',
      memo: '샘플 출고 메모',
      recordedBy: '박재민',
      purpose: '샘플 출고',
      fileName: '견본출고.png',
    })
    expect(() =>
      applyStockCommand(state, {
        type: 'post_outbound',
        operationId: 'op-out-too-many',
        itemId: ITEM,
        warehouseId: MAIN,
        qty: 9,
      }),
    ).toThrow(/현재고를 초과해 출고할 수 없습니다/)
  })

  it('자산화는 등록자를 남긴다', () => {
    let state = createStockState()
    state = applyStockCommand(state, {
      type: 'post_direct_in',
      operationId: 'op-in-asset',
      itemId: ITEM,
      warehouseId: MAIN,
      qty: 3,
    }).state
    state = applyStockCommand(state, {
      type: 'convert_to_asset',
      operationId: 'op-convert',
      itemId: ITEM,
      warehouseId: MAIN,
      qty: 1,
      recordedBy: '박재민',
      memo: '견본 전환',
      fileName: '견본전환.png',
    }).state
    expect(state.ledger.at(-1)).toMatchObject({
      txnType: 'convert_out',
      recordedBy: '박재민',
      memo: '견본 전환',
      fileName: '견본전환.png',
    })
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
    state = applyStockCommand(state, {
      type: 'post_direct_in',
      operationId: 'op-in-dept',
      itemId: ITEM,
      warehouseId: MAIN,
      qty: 2,
    }).state
    const named = applyStockCommand(state, {
      type: 'post_issue',
      operationId: 'op-issue-dept',
      itemId: ITEM,
      warehouseId: MAIN,
      qty: 1,
      departmentName: '샘플품질',
      recordedBy: 'pjm7908@hanmail.net',
    }).state
    expect(named.ledger.at(-1)).toMatchObject({
      txnType: 'issue',
      departmentName: '샘플품질',
    })
    expect(named.ledger.at(-1)?.recordedBy).toBeUndefined()
    expect(ledgerCatalogFields({ itemName: '복사용지', itemUnit: '박스', purchaseKind: '일반 비품', warehouseName: '본사창고', partnerName: '견본문구' })).toEqual({
      itemName: '복사용지',
      itemUnit: '박스',
      purchaseKind: '일반 비품',
      warehouseName: '본사창고',
      partnerName: '견본문구',
    })
    expect(
      ledgerCatalogFields({
        itemName: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
        itemUnit: 'guest:box',
        purchaseKind: 'user@example.com',
        warehouseName: 'sample:wh',
        partnerName: 'item-paper',
      }),
    ).toEqual({})
    expect(
      applyStockCommand(createStockState(), {
        type: 'post_direct_in',
        operationId: 'op-in-rec',
        itemId: ITEM,
        warehouseId: MAIN,
        qty: 1,
        recordedBy: '박재민',
      }).state.ledger[0],
    ).toMatchObject({ recordedBy: '박재민' })
  })

  it('발주에 구매요청 번호를 남긴다', () => {
    const state = applyStockCommand(createStockState(), {
      type: 'draft_order',
      operationId: 'op-req',
      orderId: 'ord-req',
      itemId: ITEM,
      qty: 4,
      requestId: 'REQ-DEMO-01',
    }).state
    expect(state.orders.get('ord-req')?.requestId).toBe('REQ-DEMO-01')
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
      memo: '견본 실사',
      recordedBy: '박재민',
      fileName: '견본실사.png',
    }).state
    expect(onHand(state, ITEM, MAIN)).toBe(4)
    expect(state.ledger.at(-1)).toMatchObject({
      txnType: 'adjust',
      memo: '견본 실사',
      recordedBy: '박재민',
      fileName: '견본실사.png',
    })

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

  it('정정·반납은 확정 당시 품목명·단위·구매 구분·창고명·공급사명을 그대로 둔다', () => {
    let state = applyStockCommand(createStockState(), {
      type: 'post_direct_in',
      operationId: 'op-in-snap',
      itemId: ITEM,
      warehouseId: MAIN,
      qty: 3,
      partnerId: 'partner-guest',
    }).state
    state.ledger[0] = {
      ...state.ledger[0],
      itemName: '옛복사용지',
      itemUnit: '박스',
      purchaseKind: '일반 비품',
      warehouseName: '본사창고',
      partnerName: '견본문구',
    }
    const reversed = applyStockCommand(state, {
      type: 'reverse_transaction',
      operationId: 'op-rev-snap',
      sourceOperationId: 'op-in-snap',
    }).state
    expect(reversed.ledger.at(-1)).toMatchObject({
      txnType: 'reversal',
      itemName: '옛복사용지',
      itemUnit: '박스',
      purchaseKind: '일반 비품',
      warehouseName: '본사창고',
      partnerName: '견본문구',
    })

    let issued = applyStockCommand(createStockState(), {
      type: 'post_direct_in',
      operationId: 'op-in-iss',
      itemId: ITEM,
      warehouseId: MAIN,
      qty: 2,
    }).state
    issued = applyStockCommand(issued, {
      type: 'post_issue',
      operationId: 'op-iss',
      itemId: ITEM,
      warehouseId: MAIN,
      qty: 1,
      personName: '견본 김대리',
    }).state
    issued.ledger[1] = {
      ...issued.ledger[1],
      itemName: '옛복사용지',
      itemUnit: '박스',
      purchaseKind: '일반 비품',
      warehouseName: '본사창고',
    }
    const returned = applyStockCommand(issued, {
      type: 'post_return',
      operationId: 'op-ret',
      itemId: ITEM,
      warehouseId: MAIN,
      qty: 1,
      sourceOperationId: 'op-iss',
    }).state
    expect(returned.ledger.at(-1)).toMatchObject({
      txnType: 'return',
      itemName: '옛복사용지',
      itemUnit: '박스',
      purchaseKind: '일반 비품',
      warehouseName: '본사창고',
    })
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

  it('수령 불량은 현재고와 발주 잔량에 넣지 않는다', () => {
    let state = createStockState()
    state = applyStockCommand(state, {
      type: 'confirm_order',
      operationId: 'op-order',
      orderId: 'ord-1',
      itemId: ITEM,
      qty: 10,
    }).state
    state = applyStockCommand(state, {
      type: 'post_receipt',
      operationId: 'op-recv',
      orderId: 'ord-1',
      itemId: ITEM,
      warehouseId: MAIN,
      qty: 6,
      defectQty: 2,
    }).state
    expect(onHand(state, ITEM, MAIN)).toBe(6)
    expect(companyOnHand(state, ITEM)).toBe(6)
    expect(orderRemaining(state, 'ord-1')).toBe(4)
    expect(state.ledger.some((line) => line.txnType === 'reject' && line.qtyDelta === 2)).toBe(true)
  })

  it('검수 통과분 반품은 현재고를 줄이고 발주 잔량을 되돌린다', () => {
    let state = createStockState()
    state = applyStockCommand(state, {
      type: 'confirm_order',
      operationId: 'op-order',
      orderId: 'ord-1',
      itemId: ITEM,
      qty: 10,
    }).state
    state = applyStockCommand(state, {
      type: 'post_receipt',
      operationId: 'op-recv',
      orderId: 'ord-1',
      itemId: ITEM,
      warehouseId: MAIN,
      qty: 6,
      defectQty: 2,
    }).state
    state = applyStockCommand(state, {
      type: 'post_supplier_return',
      operationId: 'op-back',
      orderId: 'ord-1',
      itemId: ITEM,
      warehouseId: MAIN,
      qty: 2,
    }).state
    expect(onHand(state, ITEM, MAIN)).toBe(4)
    expect(orderRemaining(state, 'ord-1')).toBe(6)
    expect(() =>
      applyStockCommand(state, {
        type: 'post_supplier_return',
        operationId: 'op-back-too-many',
        orderId: 'ord-1',
        itemId: ITEM,
        warehouseId: MAIN,
        qty: 5,
      }),
    ).toThrow(/검수 통과/)
  })

  it('직접 입고 반품은 원입고 잔량만 받고 발주를 만들지 않는다', () => {
    let state = applyStockCommand(createStockState(), {
      type: 'post_direct_in',
      operationId: 'op-in',
      itemId: ITEM,
      warehouseId: MAIN,
      qty: 5,
      partnerId: 'partner-guest',
    }).state
    state = applyStockCommand(state, {
      type: 'post_supplier_return',
      operationId: 'op-back',
      sourceOperationId: 'op-in',
      itemId: ITEM,
      warehouseId: MAIN,
      qty: 2,
    }).state
    expect(onHand(state, ITEM, MAIN)).toBe(3)
    expect(state.orders.size).toBe(0)
    expect(inboundReturnBalance(state.ledger, 'op-in', ITEM)).toEqual({ inbound: 5, already: 2, left: 3 })
    expect(state.ledger.some((line) => line.txnType === 'supplier_return' && line.partnerId === 'partner-guest')).toBe(
      true,
    )
    expect(state.ledger.some((line) => line.txnType === 'supplier_return' && line.orderId)).toBe(false)
    expect(() =>
      applyStockCommand(state, {
        type: 'post_supplier_return',
        operationId: 'op-back-too-many',
        sourceOperationId: 'op-in',
        itemId: ITEM,
        warehouseId: MAIN,
        qty: 4,
      }),
    ).toThrow(/원입고/)
    expect(() =>
      applyStockCommand(createStockState(), {
        type: 'post_supplier_return',
        operationId: 'op-none',
        itemId: ITEM,
        warehouseId: MAIN,
        qty: 1,
      }),
    ).toThrow(/입고 줄/)
  })

  it('음수 재고는 기본 차단이고 허용이면 사유를 남긴다', () => {
    let state = applyStockCommand(createStockState(), {
      type: 'post_direct_in',
      operationId: 'op-in-4',
      itemId: ITEM,
      warehouseId: MAIN,
      qty: 4,
    }).state
    expect(() =>
      applyStockCommand(state, {
        type: 'post_issue',
        operationId: 'op-over',
        itemId: ITEM,
        warehouseId: MAIN,
        qty: 5,
        personName: '김대리',
      }),
    ).toThrow(/현재고를 초과해 반출/)
    expect(() =>
      applyStockCommand(
        state,
        {
          type: 'post_issue',
          operationId: 'op-over-reason',
          itemId: ITEM,
          warehouseId: MAIN,
          qty: 5,
          personName: '김대리',
        },
        { allowNegative: true, allowOverReceipt: false },
      ),
    ).toThrow(/초과 사유/)
    state = applyStockCommand(
      state,
      {
        type: 'post_issue',
        operationId: 'op-over-ok',
        itemId: ITEM,
        warehouseId: MAIN,
        qty: 5,
        personName: '김대리',
        reason: '긴급 반출',
      },
      { allowNegative: true, allowOverReceipt: false },
    ).state
    expect(onHand(state, ITEM, MAIN)).toBe(-1)
    expect(state.ledger.at(-1)?.reason).toBe('긴급 반출')
  })

  it('초과 수령은 기본 차단이고 허용이면 사유를 남긴다', () => {
    let state = applyStockCommand(createStockState(), {
      type: 'confirm_order',
      operationId: 'op-over-ord',
      orderId: 'ord-over',
      itemId: ITEM,
      qty: 4,
    }).state
    expect(() =>
      applyStockCommand(state, {
        type: 'post_receipt',
        operationId: 'op-recv-over',
        orderId: 'ord-over',
        itemId: ITEM,
        warehouseId: MAIN,
        qty: 5,
      }),
    ).toThrow(/잔량을 초과해 수령/)
    state = applyStockCommand(
      state,
      {
        type: 'post_receipt',
        operationId: 'op-recv-over-ok',
        orderId: 'ord-over',
        itemId: ITEM,
        warehouseId: MAIN,
        qty: 5,
        reason: '선입고',
      },
      { allowNegative: false, allowOverReceipt: true },
    ).state
    expect(onHand(state, ITEM, MAIN)).toBe(5)
    expect(state.ledger.at(-1)?.reason).toBe('선입고')
  })
})
