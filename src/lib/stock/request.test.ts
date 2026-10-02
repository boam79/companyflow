import { describe, expect, it } from 'vitest'
import { applyPurchaseRequest, assertOrderFitsRequest, requestCaption, requestHasRemaining, requestRemainingQty, requestSavedNotice, requestSelectLabel, requestTotalAmount } from './request'

const PAPER = 'item-paper'
const REQUEST = applyPurchaseRequest({
  id: 'REQ-DEMO-01',
  requesterName: '견본 김대리',
  departmentName: '샘플총무',
  neededAt: '2026-10-10',
  purpose: '샘플 비품 보충',
  lines: [{ itemId: PAPER, qty: 10, unitPrice: 15000 }],
})

describe('구매요청', () => {
  it('요청자·품목·수량이 있으면 바로 열린다', () => {
    expect(REQUEST.status).toBe('open')
    expect(requestTotalAmount(REQUEST.lines)).toBe(150000)
    expect(requestCaption(REQUEST, [{ id: PAPER, name: '샘플 복사용지' }])).toBe(
      '견본 김대리 · 샘플총무 · 필요 2026-10-10 · 샘플 복사용지 10 · 150,000원',
    )
    expect(requestSavedNotice(false)).toMatch(/구매요청을 저장했습니다/)
    expect(requestSavedNotice(false)).not.toMatch(/결재|반려|재요청/)
  })

  it('요청자나 수량이 없으면 저장하지 않는다', () => {
    expect(() =>
      applyPurchaseRequest({
        id: 'REQ-1',
        requesterName: '  ',
        lines: [{ itemId: PAPER, qty: 1 }],
      }),
    ).toThrow(/요청자/)
    expect(() =>
      applyPurchaseRequest({
        id: 'REQ-1',
        requesterName: '견본 김대리',
        lines: [{ itemId: PAPER, qty: 0 }],
      }),
    ).toThrow(/품목과 수량/)
    expect(() =>
      applyPurchaseRequest({
        id: '  ',
        requesterName: '견본 김대리',
        lines: [{ itemId: PAPER, qty: 1 }],
      }),
    ).toThrow(/요청 번호/)
    expect(() =>
      applyPurchaseRequest({
        id: 'REQ-1',
        requesterName: '견본 김대리',
        lines: [
          { itemId: PAPER, qty: 1 },
          { itemId: PAPER, qty: 2 },
        ],
      }),
    ).toThrow(/한 줄/)
  })

  it('연결된 발주는 요청 잔량을 넘지 못한다', () => {
    const orders = [
      { id: 'ORD-1', itemId: PAPER, qty: 6, requestId: REQUEST.id },
    ]
    expect(requestRemainingQty(REQUEST, orders, PAPER)).toBe(4)
    expect(requestHasRemaining(REQUEST, orders)).toBe(true)
    expect(() =>
      assertOrderFitsRequest({
        request: REQUEST,
        orders,
        lines: [{ itemId: PAPER, qty: 5 }],
      }),
    ).toThrow(/잔량/)
    assertOrderFitsRequest({
      request: REQUEST,
      orders,
      lines: [{ itemId: PAPER, qty: 4 }],
    })
    assertOrderFitsRequest({
      request: REQUEST,
      orders,
      lines: [{ itemId: PAPER, qty: 10 }],
      exceptOrderId: 'ORD-1',
    })
    expect(() =>
      assertOrderFitsRequest({
        request: REQUEST,
        orders,
        lines: [{ itemId: 'item-other', qty: 1 }],
      }),
    ).toThrow(/요청에 없는 품목/)
    expect(
      requestSelectLabel(REQUEST, orders, [{ id: PAPER, name: '샘플 복사용지' }]),
    ).toBe('REQ-DEMO-01 · 견본 김대리 · 샘플 복사용지 잔량 4')
  })
})
