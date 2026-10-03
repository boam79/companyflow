import { describe, expect, it } from 'vitest'
import { applyPurchaseRequest, assertOrderFitsRequest, overduePurchaseRequestCaption, overduePurchaseRequests, requestAttachment, requestCaption, requestHasRemaining, requestListButtonLabel, requestProgress, requestRemainingQty, requestSavedNotice, requestSelectLabel, requestTotalAmount, stampRequestLines } from './request'

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
      '견본 김대리 · 샘플총무 · 필요 2026-10-10 · 샘플 비품 보충 · 샘플 복사용지 10 · 150,000원',
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
    ).toBe('REQ-DEMO-01 · 견본 김대리 · 샘플 복사용지 미발주 4 · 부분발주')
    expect(requestProgress(REQUEST, orders)).toBe('부분발주')
    expect(requestProgress(REQUEST, [])).toBe('미발주')
    expect(requestSelectLabel(REQUEST, [], [{ id: PAPER, name: '샘플 복사용지' }])).not.toMatch(/잔량 0/)
    expect(
      requestSelectLabel(REQUEST, [{ id: 'ORD-FULL', itemId: PAPER, qty: 10, requestId: REQUEST.id }], [
        { id: PAPER, name: '샘플 복사용지' },
      ]),
    ).toBe('REQ-DEMO-01 · 견본 김대리 · 발주완료')
    expect(
      requestSelectLabel(REQUEST, [{ id: 'ORD-FULL', itemId: PAPER, qty: 10, requestId: REQUEST.id }], [
        { id: PAPER, name: '샘플 복사용지' },
      ]),
    ).not.toMatch(/잔량 0|미발주 0/)
    expect(requestListButtonLabel(REQUEST, [], [{ id: PAPER, name: '샘플 복사용지' }])).toMatch(/미발주$/)
    expect(requestListButtonLabel(REQUEST, orders, [{ id: PAPER, name: '샘플 복사용지' }])).toMatch(/부분발주$/)
    expect(requestListButtonLabel(REQUEST, [], [{ id: PAPER, name: '샘플 복사용지' }])).not.toMatch(/잔량 0|미발주 0/)
  })

  it('요청 첨부는 PDF·PNG·JPEG만 받는다', () => {
    const attached = requestAttachment({
      name: '견본요청.png',
      mime: 'image/png',
      bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
    })
    expect(attached.fileName).toBe('견본요청.png')
    expect(attached.fileMime).toBe('image/png')
    const withFile = applyPurchaseRequest({
      id: 'REQ-FILE',
      requesterName: '견본 김대리',
      lines: [{ itemId: PAPER, qty: 1 }],
      ...attached,
    })
    expect(withFile.fileName).toBe('견본요청.png')
    expect(requestCaption(withFile, [{ id: PAPER, name: '샘플 복사용지' }])).toContain('견본요청.png')
    expect(() =>
      requestAttachment({
        name: 'memo.txt',
        mime: 'text/plain',
        bytes: new Uint8Array([0x61, 0x62, 0x63]),
      }),
    ).toThrow(/PDF/)
  })

  it('요청 줄은 확정 당시 품목명·단위를 남긴다', () => {
    const stamped = stampRequestLines(
      [{ itemId: PAPER, qty: 10, unitPrice: 15000 }],
      [{ id: PAPER, name: '샘플 복사용지', unit: '박스', purchaseKind: 'supply' }],
      [{ id: 'supply', name: '일반 비품' }],
    )
    expect(stamped[0]).toMatchObject({
      itemName: '샘플 복사용지',
      itemUnit: '박스',
      purchaseKind: '일반 비품',
    })
    expect(
      requestCaption(
        applyPurchaseRequest({
          id: 'REQ-SNAP',
          requesterName: '견본 김대리',
          lines: stamped,
        }),
        [{ id: PAPER, name: '새복사용지' }],
      ),
    ).toContain('샘플 복사용지 · 박스 · 일반 비품 10')
  })

  it('필요일이 지난 미발주 요청만 보여 준다', () => {
    expect(overduePurchaseRequests([REQUEST], [], '2026-10-11').map((row) => row.id)).toEqual(['REQ-DEMO-01'])
    expect(overduePurchaseRequests([REQUEST], [], '2026-10-10')).toEqual([])
    expect(
      overduePurchaseRequests(
        [REQUEST],
        [{ id: 'ORD-FULL', itemId: PAPER, qty: 10, requestId: REQUEST.id }],
        '2026-10-11',
      ),
    ).toEqual([])
    expect(overduePurchaseRequestCaption(REQUEST)).toBe(
      'REQ-DEMO-01 · 필요 2026-10-10 · 견본 김대리 · 샘플총무 · 샘플 비품 보충',
    )
    expect(
      overduePurchaseRequestCaption({
        ...REQUEST,
        lines: stampRequestLines(
          REQUEST.lines,
          [{ id: PAPER, name: '샘플 복사용지', unit: '박스', purchaseKind: 'supply' }],
          [{ id: 'supply', name: '일반 비품' }],
        ),
      }),
    ).toBe(
      'REQ-DEMO-01 · 필요 2026-10-10 · 견본 김대리 · 샘플총무 · 샘플 비품 보충 · 샘플 복사용지 · 박스 · 일반 비품',
    )
    expect(overduePurchaseRequestCaption(REQUEST)).not.toMatch(/필요일 지남 0/)
  })
})
