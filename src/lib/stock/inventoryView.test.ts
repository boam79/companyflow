import { describe, expect, it } from 'vitest'
import { COMPANY_ASSET_ITEMS, PAPER_ITEM } from '../master/book'
import { applyStockCommand, createStockState } from './engine'
import {
  buildAssetOrderList,
  buildSupplyInventory,
  buildSupplyOrderList,
  lowStockLine,
  orderRemainingCaption,
  resolveOrderPartnerId,
  resolveIssueDepartment,
  stockEmptyItemsLead,
  stockInboundItemHint,
  stockAssetsLinkLabel,
  stockPageLead,
  stockLastSaveLead,
  stockReturnLead,
  stockReturnSourceLead,
  stockSavedNotice,
  stockDraftOrderId,
  stockIssuePersonName,
  stockAdjustReason,
  stockAdjustLead,
  stockDirectInLead,
  stockIssueNoteLead,
  stockOnHandPreview,
  stockOnHandPreviewKind,
  stockTransferOnHandPreview,
  warehouseOptionLabel,
  partnerSelectHint,
  stockQtyUnitHint,
  orderItemCaption,
  inventoryItemCaption,
  filterInventory,
  overdueSupplyOrders,
  overdueSupplyOrderCaption,
  filterOrders,
  assertDueReturnAt,
  assertInboundAt,
  stockOutboundLead,
  stockReceiptLead,
  stockConvertLead,
  stockSupplierReturnLead,
  stockTransferLead,
  orderReceiptProgress,
  orderQtyText,
  orderInspectCaption,
  publicStockOrderId,
  supplyLowStock,
  transferWarehouseIds,
  defaultWarehouseId,
  inventoryShowsTransferFields,
  inventoryShowsWarehouseField,
  inventoryWarehouseColumns,
  inventoryWarehouseQtyLabel,
  supplyItems,
  supplyOrderCsv,
  supplyInventoryCsv,
  overdueIssueReturnLine,
  overdueIssueReturns,
  todayYmd,
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
    expect(stockEmptyItemsLead()).toContain('기준정보에서 품목을 등록')
    expect(stockEmptyItemsLead()).not.toMatch(/복사용지/)
    expect(stockPageLead()).toContain('자산 메뉴')
    expect(stockPageLead()).not.toMatch(/책상|컴퓨터/)
    expect(stockInboundItemHint()).toContain('비품으로 등록')
    expect(stockInboundItemHint()).not.toMatch(/책상|컴퓨터/)
    expect(stockInboundItemHint({ unit: '박스' })).toContain('단위 박스')
    expect(stockAssetsLinkLabel()).toBe('자리의 물건은 자산')
    expect(stockAssetsLinkLabel()).not.toMatch(/가구|책상/)
    expect(stockIssuePersonName()).toBe('')
    expect(resolveIssueDepartment('샘플총무', [{ id: 'dept-guest-admin', name: '샘플총무' }])).toEqual({
      departmentId: 'dept-guest-admin',
      departmentName: '샘플총무',
    })
    expect(resolveIssueDepartment('샘플품질', [{ id: 'dept-guest-admin', name: '샘플총무' }])).toEqual({
      departmentName: '샘플품질',
    })
    expect(stockDraftOrderId()).toBe('')
    expect(stockAdjustReason()).toBe('')
    expect(stockAdjustLead(7, '7')).toBe('장부 7 · 맞음')
    expect(stockAdjustLead(7, '6')).toBe('장부 7 · 차이 -1 · 확정 후 6')
    expect(stockAdjustLead(7, '9')).toBe('장부 7 · 차이 +2 · 확정 후 9')
    expect(stockAdjustLead(7, '')).toBe('장부 7')
    expect(stockAdjustLead(7, '6')).not.toMatch(/실사 차이|operation_id|본사창고/)
    expect(defaultWarehouseId(WAREHOUSES)).toBe('wh-main')
    expect(
      defaultWarehouseId(
        [
          { id: 'wh-sub' },
          { id: 'wh-main' },
        ],
        state,
        PAPER_ITEM.id,
      ),
    ).toBe('wh-main')
    expect(transferWarehouseIds(WAREHOUSES)).toEqual({
      fromWarehouseId: 'wh-main',
      toWarehouseId: 'wh-sub',
    })
    expect(transferWarehouseIds([{ id: 'wh-a' }])).toEqual({
      fromWarehouseId: 'wh-a',
      toWarehouseId: '',
    })
    expect(
      transferWarehouseIds(
        [
          { id: 'wh-sub' },
          { id: 'wh-main' },
        ],
        state,
        PAPER_ITEM.id,
      ),
    ).toEqual({
      fromWarehouseId: 'wh-main',
      toWarehouseId: 'wh-sub',
    })
    expect(stockSupplierReturnLead()).not.toMatch(/아직/)
    expect(stockSupplierReturnLead(0)).not.toMatch(/반품 가능/)
    expect(stockSupplierReturnLead(2)).toContain('반품 가능 2')
    expect(stockSupplierReturnLead(2)).not.toMatch(/반품 가능 0|operation_id/)
    expect(stockSupplierReturnLead(7, 'inbound')).toContain('원입고')
    expect(stockSupplierReturnLead(7, 'inbound')).toContain('발주는 만들지 않습니다')
    expect(stockSupplierReturnLead(7, 'inbound')).not.toMatch(/발주 잔량|반품 가능 0|guest:|operation_id/)
    expect(stockSupplierReturnLead(0, 'inbound')).not.toMatch(/반품 가능/)
    expect(stockSavedNotice({ duplicate: true, actionLabel: '입고', assetCount: 0 })).toBe(
      '같은 거래는 한 번만 반영됩니다.',
    )
    expect(stockSavedNotice({ duplicate: true, actionLabel: '입고', assetCount: 0 })).not.toMatch(/operation_id/)
    expect(stockSavedNotice({ duplicate: false, actionLabel: '입고', assetCount: 0 })).toBe('저장했습니다. (입고)')
    expect(
      stockSavedNotice({ duplicate: false, actionLabel: '입고', assetCount: 0, createdItemName: '클립' }),
    ).toContain('클립')
    expect(stockLastSaveLead()).not.toMatch(/operation_id|[0-9a-f]{8}-/)
    expect(stockReturnSourceLead('견본 김대리')).toBe('견본 김대리 반출')
    expect(stockReturnSourceLead('')).toBe('수불부에서 반출 줄을 고르세요.')
    expect(stockReturnSourceLead('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')).toBe('수불부에서 반출 줄을 고르세요.')
    expect(stockReturnLead('견본 김대리', 1, 1)).toBe('견본 김대리 반출 · 반납 가능 1')
    expect(stockReturnLead('견본 김대리', 1, 0)).toBe('견본 김대리 반출 · 다 돌아왔습니다.')
    expect(stockReturnLead('견본 김대리', 1, 0)).not.toMatch(/반납 가능 0/)
    expect(stockReturnLead('', 0, 0)).toBe('수불부에서 반출 줄을 고르세요.')
    expect(stockReturnLead('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', 2, 2)).toBe(
      '수불부에서 반출 줄을 고르세요. · 반납 가능 2',
    )
    expect(stockReturnLead('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', 2, 2)).not.toMatch(
      /aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/,
    )
    expect(stockDirectInLead()).toContain('발주·요청 없이')
    expect(stockDirectInLead()).toContain('선택')
    expect(stockDirectInLead()).not.toMatch(/아직|operation_id|본사창고|발주 번호/)
    expect(stockIssueNoteLead()).toContain('선택')
    expect(stockIssueNoteLead()).not.toMatch(/결재|배정/)
    expect(assertDueReturnAt('')).toBe('')
    expect(assertDueReturnAt('2026-10-10')).toBe('2026-10-10')
    expect(() => assertDueReturnAt('10/10')).toThrow(/날짜/)
    expect(assertInboundAt('2026-10-01')).toBe('2026-10-01')
    expect(() => assertInboundAt('')).toThrow(/입고일/)
    expect(() => assertInboundAt('10/01')).toThrow(/날짜/)
    expect(stockOutboundLead()).toContain('현재고가 줄어듭니다')
    expect(stockOutboundLead()).not.toMatch(/김담당|반출 성명/)
    expect(stockReceiptLead('', 0, '0')).toBe('정상만 현재고에 들어갑니다.')
    expect(stockReceiptLead('', 0, '0')).not.toMatch(/잔량 0|불량 0/)
    expect(stockReceiptLead('ORD-DEMO-01', 2, '1')).toBe(
      '정상만 현재고에 들어갑니다. 불량은 현재고에 넣지 않습니다. 발주 ORD-DEMO-01 잔량 2.',
    )
    expect(stockReceiptLead('ORD-DEMO-01', 0, '')).toBe(
      '정상만 현재고에 들어갑니다. 이 발주는 다 받았습니다.',
    )
    expect(stockReceiptLead('ORD-DEMO-01', 0, '')).not.toMatch(/잔량 0/)
    expect(stockReceiptLead('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', 2, '')).toBe(
      '정상만 현재고에 들어갑니다.',
    )
    expect(stockReceiptLead('ORD-AST-01', 1, '', true)).toBe(
      '수령하면 현재고 없이 자리의 물건으로 등록됩니다. 발주 ORD-AST-01 잔량 1.',
    )
    expect(stockReceiptLead('ORD-AST-01', 1, '1', true)).not.toMatch(/불량/)
    expect(stockConvertLead()).toContain('자리의 물건만')
    expect(stockConvertLead()).not.toMatch(/복사용지|김담당|operation_id/)
    expect(buildSupplyInventory(items, WAREHOUSES, state)).toEqual([
      {
        itemId: 'item-paper',
        itemName: '복사용지',
        purchaseKind: '일반 비품',
        minStock: 0,
        quantities: [5, 2],
        total: 7,
      },
    ])
    expect(inventoryWarehouseColumns(WAREHOUSES).map((row) => row.name)).toEqual(['본사창고', '부속창고'])
    expect(inventoryWarehouseColumns([{ id: 'wh-main', name: '본사창고' }])).toEqual([])
    expect(inventoryWarehouseQtyLabel('견본창고', 0)).toBe('견본창고 현재고 0')
    expect(inventoryShowsWarehouseField('post_direct_in', 2)).toBe(true)
    expect(inventoryShowsWarehouseField('draft_order', 2)).toBe(false)
    expect(inventoryShowsWarehouseField('post_issue', 0)).toBe(false)
    expect(inventoryShowsWarehouseField('convert_to_asset', 2)).toBe(true)
    expect(inventoryShowsTransferFields('transfer_stock', 2)).toBe(true)
    expect(inventoryShowsTransferFields('transfer_stock', 1)).toBe(false)
    expect(inventoryShowsTransferFields('post_direct_in', 2)).toBe(false)
    expect(stockTransferLead()).toContain('회사 합계는 그대로')
    expect(stockTransferLead()).not.toMatch(/아직|본사창고|operation_id/)
    expect(lowStockLine({ itemName: '복사용지', onHand: 7, minStock: 10 })).toBe('복사용지 7 / 최소 10')
    expect(lowStockLine({ itemName: '복사용지', onHand: 7, minStock: 10, unit: '박스' })).toBe(
      '복사용지 7 / 최소 10 · 박스',
    )
    expect(lowStockLine({ itemName: '복사용지', onHand: 7, minStock: 10, unit: '박스', code: 'DEMO-PAPER' })).toBe(
      '복사용지 7 / 최소 10 · 박스 · DEMO-PAPER',
    )
    expect(
      lowStockLine({
        itemName: '복사용지',
        onHand: 7,
        minStock: 10,
        unit: '박스',
        code: 'DEMO-PAPER',
        purchaseKind: '일반 비품',
      }),
    ).toBe('복사용지 7 / 최소 10 · 박스 · DEMO-PAPER · 일반 비품')
    expect(inventoryItemCaption({ itemName: '샘플 복사용지', itemCode: 'DEMO-PAPER', itemUnit: '박스' })).toBe(
      '샘플 복사용지 · DEMO-PAPER · 박스',
    )
    expect(
      inventoryItemCaption({
        itemName: '샘플 복사용지',
        itemCode: 'DEMO-PAPER',
        itemUnit: '박스',
        purchaseKind: '일반 비품',
        minStock: 10,
      }),
    ).toBe('샘플 복사용지 · DEMO-PAPER · 박스 · 일반 비품 · 최소 10')
    expect(
      filterInventory(
        [
          {
            itemName: '샘플 복사용지',
            itemCode: 'DEMO-PAPER',
            itemUnit: '박스',
            purchaseKind: '일반 비품',
          },
          {
            itemName: '견본 볼펜',
            itemCode: 'DEMO-PEN',
            itemUnit: '자루',
            purchaseKind: '자재',
          },
        ],
        'DEMO-PAPER',
      ).map((row) => row.itemName),
    ).toEqual(['샘플 복사용지'])
    expect(
      supplyInventoryCsv(
        [
          {
            itemId: 'item-paper',
            itemName: '샘플 복사용지',
            itemCode: 'DEMO-PAPER',
            itemUnit: '박스',
            purchaseKind: '일반 비품',
            minStock: 10,
            quantities: [7, 0],
            total: 7,
          },
        ],
        [
          { id: 'wh-main', name: '샘플창고', locationText: '1층' },
          { id: 'wh-sub', name: '견본창고', locationText: '2층' },
        ],
      ),
    ).toContain('샘플 복사용지,DEMO-PAPER,박스,일반 비품,10,7,0,7')
    expect(
      supplyInventoryCsv(
        [
          {
            itemId: 'item-paper',
            itemName: '샘플 복사용지',
            itemCode: 'DEMO-PAPER',
            itemUnit: '박스',
            purchaseKind: '일반 비품',
            minStock: 10,
            quantities: [7, 0],
            total: 7,
          },
        ],
        [
          { id: 'wh-main', name: '샘플창고', locationText: '1층' },
          { id: 'wh-sub', name: '견본창고', locationText: '2층' },
        ],
      ),
    ).toContain('샘플창고 · 1층,견본창고 · 2층')
    expect(
      supplyInventoryCsv(
        [
          {
            itemId: 'item-paper',
            itemName: '샘플 복사용지',
            itemCode: 'DEMO-PAPER',
            itemUnit: '박스',
            purchaseKind: '일반 비품',
            minStock: 10,
            quantities: [7, 0],
            total: 7,
          },
        ],
        [
          { id: 'wh-main', name: '샘플창고' },
          { id: 'wh-sub', name: '견본창고' },
        ],
      ),
    ).not.toMatch(/단가|금액|item-paper/)
    expect(
      supplyLowStock([{ ...PAPER_ITEM, minStock: 10 }, ...COMPANY_ASSET_ITEMS.map((item) => ({ ...item, minStock: 2 }))], state).map(
        (row) => [row.itemName, row.onHand, row.minStock],
      ),
    ).toEqual([['복사용지', 7, 10]])
    expect(supplyLowStock([{ ...PAPER_ITEM, minStock: 0 }], state)).toEqual([])
  })

  it('반출 반납 기한은 지난 원반출만 보여 준다', () => {
    let state = applyStockCommand(createStockState(), {
      type: 'post_direct_in',
      operationId: 'op-in',
      itemId: PAPER_ITEM.id,
      warehouseId: 'wh-main',
      qty: 4,
    }).state
    state = applyStockCommand(state, {
      type: 'post_issue',
      operationId: 'op-late',
      itemId: PAPER_ITEM.id,
      warehouseId: 'wh-main',
      qty: 2,
      personName: '견본 김대리',
      dueReturnAt: '2026-01-01',
    }).state
    state = applyStockCommand(state, {
      type: 'post_issue',
      operationId: 'op-soon',
      itemId: PAPER_ITEM.id,
      warehouseId: 'wh-main',
      qty: 1,
      personName: '견본 김대리',
      dueReturnAt: '2026-12-31',
    }).state
    expect(overdueIssueReturnLine('견본 김대리', '복사용지', '2026-01-01')).toBe(
      '견본 김대리 · 복사용지 · 기한 지남 2026-01-01',
    )
    expect(
      overdueIssueReturnLine('견본 김대리', '복사용지', '2026-01-01', {
        departmentName: '샘플총무',
        purpose: '샘플 청소',
      }),
    ).toBe('견본 김대리 · 샘플총무 · 복사용지 · 샘플 청소 · 기한 지남 2026-01-01')
    expect(
      overdueIssueReturnLine('견본 김대리', '복사용지', '2026-01-01', {
        departmentName: '샘플총무',
        memo: '샘플 반출 메모',
        remainingQty: 1,
      }),
    ).toBe('견본 김대리 · 샘플총무 · 복사용지 · 샘플 반출 메모 · 기한 지남 2026-01-01 · 미반납 1')
    expect(overdueIssueReturnLine('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', '복사용지', '2026-01-01')).toBe(
      '복사용지 · 기한 지남 2026-01-01',
    )
    expect(overdueIssueReturnLine('guest:emp', '', '2026-01-01')).toBe('비품 · 기한 지남 2026-01-01')
    expect(overdueIssueReturnLine('guest:emp', '', '2026-01-01')).not.toMatch(/guest:|기한 지남 0|operation_id/)
    expect(overdueIssueReturns(state.ledger, [PAPER_ITEM], '2026-10-03').map((row) => row.caption)).toEqual([
      '견본 김대리 · 복사용지 · 기한 지남 2026-01-01 · 275일 · 미반납 2',
    ])
    expect(
      overdueIssueReturns(
        state.ledger.map((line) =>
          line.operationId === 'op-late' ? { ...line, itemName: '옛복사용지' } : line,
        ),
        [{ ...PAPER_ITEM, name: '새복사용지' }],
        '2026-10-03',
      ).map((row) => row.caption),
    ).toEqual(['견본 김대리 · 옛복사용지 · 기한 지남 2026-01-01 · 275일 · 미반납 2'])
    state = applyStockCommand(state, {
      type: 'post_return',
      operationId: 'op-back',
      itemId: PAPER_ITEM.id,
      warehouseId: 'wh-main',
      qty: 2,
      sourceOperationId: 'op-late',
    }).state
    expect(overdueIssueReturns(state.ledger, [PAPER_ITEM], '2026-10-03')).toEqual([])
  })

  it('현재고 안내는 고른 품목 발주만 붙인다', () => {
    const paper = { itemId: 'item-paper', itemName: '복사용지', quantities: [8], total: 8 }
    const clip = { itemId: 'item-clip', itemName: '클립', quantities: [2], total: 2 }
    const paperOrder = { id: 'ord-paper', itemId: 'item-paper', qty: 10, status: 'confirmed' as const }
    expect(orderRemainingCaption(paper, paperOrder, 0)).toBe(' · 발주 ord-paper 다 받았습니다')
    expect(orderRemainingCaption(paper, paperOrder, 0)).not.toMatch(/잔량 0/)
    expect(orderRemainingCaption(clip, paperOrder, 0)).toBe('')
    expect(orderRemainingCaption(clip, undefined, 0)).toBe('')
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
        rejectedQty: 0,
        returnedQty: 0,
        remainingQty: 4,
        status: 'confirmed',
        supplierName: '',
        dueDate: '',
        orderDate: '',
        fileName: '',
        currency: 'KRW',
        currencyName: '원',
      },
    ])
    expect(buildAssetOrderList(items, state)).toEqual([
      {
        orderId: 'ord-desk',
        itemId: desk.id,
        itemName: '책상',
        orderedQty: 2,
        receivedQty: 0,
        rejectedQty: 0,
        returnedQty: 0,
        remainingQty: 0,
        status: 'draft',
        supplierName: '',
        dueDate: '',
        orderDate: '',
        fileName: '',
        currency: 'KRW',
        currencyName: '원',
      },
    ])
  })

  it('발주 목록에 연결 요청을 둔다', () => {
    const state = applyStockCommand(createStockState(), {
      type: 'confirm_order',
      operationId: 'op-req',
      orderId: 'ord-req',
      itemId: PAPER_ITEM.id,
      qty: 4,
      requestId: 'REQ-DEMO-01',
    }).state
    const rows = buildSupplyOrderList(items, state)
    expect(rows[0]?.requestId).toBe('REQ-DEMO-01')
    expect(supplyOrderCsv(rows)).toContain('ord-req,복사용지,,,REQ-DEMO-01,,,,,원,4,0,0,0,4,미수령')
  })

  it('발주 목록은 품목 공급사 이름을 붙인다', () => {
    const paper = { ...PAPER_ITEM, partnerId: 'partner-mfp' }
    const partners = [{ id: 'partner-mfp', name: '사무기기코리아' }]
    let state = createStockState()
    state = applyStockCommand(state, {
      type: 'confirm_order',
      operationId: 'op-paper',
      orderId: 'ord-paper',
      itemId: paper.id,
      qty: 10,
      partnerId: 'partner-mfp',
    }).state
    expect(buildSupplyOrderList([paper], state, partners)).toEqual([
      {
        orderId: 'ord-paper',
        itemId: paper.id,
        itemName: '복사용지',
        orderedQty: 10,
        receivedQty: 0,
        rejectedQty: 0,
        returnedQty: 0,
        remainingQty: 10,
        status: 'confirmed',
        partnerId: 'partner-mfp',
        supplierName: '사무기기코리아',
        dueDate: '',
        orderDate: '',
        fileName: '',
        currency: 'KRW',
        currencyName: '원',
      },
    ])
  })

  it('발주 목록은 달러 통화를 한글로 붙인다', () => {
    let state = createStockState()
    state = applyStockCommand(state, {
      type: 'confirm_order',
      operationId: 'op-paper',
      orderId: 'ord-paper',
      itemId: PAPER_ITEM.id,
      qty: 10,
      currency: 'USD',
    }).state
    expect(buildSupplyOrderList([PAPER_ITEM], state)[0]).toMatchObject({
      currency: 'USD',
      currencyName: '달러',
    })
  })

  it('발주 목록은 첨부 이름을 붙인다', () => {
    let state = createStockState()
    state = applyStockCommand(state, {
      type: 'confirm_order',
      operationId: 'op-paper',
      orderId: 'ord-paper',
      itemId: PAPER_ITEM.id,
      qty: 10,
      fileName: 'quote.png',
    }).state
    expect(buildSupplyOrderList([PAPER_ITEM], state)[0]).toMatchObject({
      orderId: 'ord-paper',
      fileName: 'quote.png',
    })
  })

  it('발주 목록은 납기를 붙인다', () => {
    let state = createStockState()
    state = applyStockCommand(state, {
      type: 'confirm_order',
      operationId: 'op-paper',
      orderId: 'ord-paper',
      itemId: PAPER_ITEM.id,
      qty: 10,
      dueDate: '2026-09-27',
    }).state
    expect(buildSupplyOrderList([PAPER_ITEM], state)[0]).toMatchObject({
      orderId: 'ord-paper',
      dueDate: '2026-09-27',
    })
  })

  it('발주 목록은 발주일을 붙인다', () => {
    let state = createStockState()
    state = applyStockCommand(state, {
      type: 'confirm_order',
      operationId: 'op-paper',
      orderId: 'ord-paper',
      itemId: PAPER_ITEM.id,
      qty: 10,
      orderDate: '2026-09-20',
    }).state
    expect(buildSupplyOrderList([PAPER_ITEM], state)[0]).toMatchObject({
      orderId: 'ord-paper',
      orderDate: '2026-09-20',
    })
  })

  it('한 발주서의 비품 줄과 자산 줄을 같은 번호로 나눈다', () => {
    const clip = { id: 'item-clip', name: '클립', stockManaged: true, assetManaged: false }
    let state = createStockState()
    state = applyStockCommand(state, {
      type: 'confirm_order',
      operationId: 'op-mix',
      orderId: 'ord-mix',
      itemId: PAPER_ITEM.id,
      qty: 10,
      lines: [
        { itemId: PAPER_ITEM.id, qty: 10 },
        { itemId: clip.id, qty: 3 },
        { itemId: desk.id, qty: 1 },
      ],
    }).state
    const mixedItems = [PAPER_ITEM, clip, ...COMPANY_ASSET_ITEMS]
    expect(buildSupplyOrderList(mixedItems, state).map((row) => [row.orderId, row.itemName, row.orderedQty])).toEqual([
      ['ord-mix', '복사용지', 10],
      ['ord-mix', '클립', 3],
    ])
    expect(buildAssetOrderList(mixedItems, state).map((row) => [row.orderId, row.itemName, row.orderedQty])).toEqual([
      ['ord-mix', '책상', 1],
    ])
    const csv = supplyOrderCsv(buildSupplyOrderList(mixedItems, state))
    expect(csv).toContain('ord-mix,복사용지,,,,,,,,원,10,0,0,0,10,미수령')
    expect(csv).toContain('ord-mix,클립,,,,,,,,원,3,0,0,0,3,미수령')
  })

  it('오늘 날짜는 YYYY-MM-DD다', () => {
    expect(todayYmd(new Date(2026, 8, 20))).toBe('2026-09-20')
  })

  it('발주 공급사는 고른 값이 있으면 그걸 쓰고 없으면 품목 기본이다', () => {
    expect(resolveOrderPartnerId('partner-kt', { partnerId: 'partner-mfp' })).toBe('partner-kt')
    expect(resolveOrderPartnerId('', { partnerId: 'partner-mfp' })).toBe('partner-mfp')
    expect(resolveOrderPartnerId('  ', undefined)).toBeUndefined()
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
    expect(csv).toContain('발주번호,품목,단위,구매구분,연결요청,공급사,발주일,납기,첨부,통화,발주,수령,불량,반품,미수령,상태')
    expect(csv).toContain('ord-paper,복사용지,,,,,,,,원,10,0,0,0,10,미수령')
  })

  it('발주 목록은 검수 불량을 따로 보여 준다', () => {
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
      operationId: 'op-recv',
      orderId: 'ord-paper',
      itemId: PAPER_ITEM.id,
      warehouseId: 'wh-main',
      qty: 6,
      defectQty: 2,
    }).state
    expect(buildSupplyOrderList([PAPER_ITEM], state)[0]).toMatchObject({
      receivedQty: 6,
      rejectedQty: 2,
      remainingQty: 4,
    })
  })

  it('발주 목록은 공급사 반품을 따로 보여 준다', () => {
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
      operationId: 'op-recv',
      orderId: 'ord-paper',
      itemId: PAPER_ITEM.id,
      warehouseId: 'wh-main',
      qty: 6,
    }).state
    state = applyStockCommand(state, {
      type: 'post_supplier_return',
      operationId: 'op-back',
      orderId: 'ord-paper',
      itemId: PAPER_ITEM.id,
      warehouseId: 'wh-main',
      qty: 2,
    }).state
    expect(buildSupplyOrderList([PAPER_ITEM], state)[0]).toMatchObject({
      receivedQty: 6,
      returnedQty: 2,
      remainingQty: 6,
    })
  })

  it('발주 항목은 미수령·부분수령·수령완료로 진행을 보여 준다', () => {
    let state = createStockState()
    state = applyStockCommand(state, {
      type: 'draft_order',
      operationId: 'op-draft',
      orderId: 'ord-draft',
      itemId: PAPER_ITEM.id,
      qty: 4,
    }).state
    state = applyStockCommand(state, {
      type: 'confirm_order',
      operationId: 'op-open',
      orderId: 'ord-open',
      itemId: PAPER_ITEM.id,
      qty: 4,
    }).state
    state = applyStockCommand(state, {
      type: 'confirm_order',
      operationId: 'op-part',
      orderId: 'ord-part',
      itemId: PAPER_ITEM.id,
      qty: 4,
    }).state
    state = applyStockCommand(state, {
      type: 'post_receipt',
      operationId: 'op-part-recv',
      orderId: 'ord-part',
      itemId: PAPER_ITEM.id,
      warehouseId: 'wh-main',
      qty: 1,
      defectQty: 1,
    }).state
    state = applyStockCommand(state, {
      type: 'confirm_order',
      operationId: 'op-done',
      orderId: 'ord-done',
      itemId: PAPER_ITEM.id,
      qty: 2,
    }).state
    state = applyStockCommand(state, {
      type: 'post_receipt',
      operationId: 'op-done-recv',
      orderId: 'ord-done',
      itemId: PAPER_ITEM.id,
      warehouseId: 'wh-main',
      qty: 2,
    }).state
    const rows = buildSupplyOrderList([PAPER_ITEM], state)
    const draft = rows.find((row) => row.orderId === 'ord-draft')!
    const open = rows.find((row) => row.orderId === 'ord-open')!
    const part = rows.find((row) => row.orderId === 'ord-part')!
    const done = rows.find((row) => row.orderId === 'ord-done')!
    expect(orderReceiptProgress(draft)).toBe('초안')
    expect(orderReceiptProgress(open)).toBe('미수령')
    expect(orderReceiptProgress(part)).toBe('부분수령')
    expect(orderReceiptProgress(done)).toBe('수령완료')
    expect(orderInspectCaption(open)).toBe('미수령 4')
    expect(orderInspectCaption(part)).toBe('정상 1 · 불량 1 · 미수령 3')
    expect(orderInspectCaption(done)).toBe('정상 2')
    expect(orderQtyText(0)).toBe('—')
    expect(orderQtyText(2)).toBe('2')
    expect(orderInspectCaption(done)).not.toMatch(/미수령 0|잔량 0|불량 0/)
    expect(orderReceiptProgress(done)).not.toMatch(/잔량 0/)
  })

  it('발주 번호 UUID와 guest 접두는 화면에 두지 않는다', () => {
    expect(publicStockOrderId('ORD-DEMO-01')).toBe('ORD-DEMO-01')
    expect(publicStockOrderId('3a27aedf-0ec9-4d28-8724-a80135eaadc3')).toBe('')
    expect(publicStockOrderId('guest:ord-1')).toBe('')
    const csv = supplyOrderCsv([
      {
        orderId: 'guest:ord-1',
        itemId: PAPER_ITEM.id,
        itemName: '복사용지',
        orderedQty: 2,
        receivedQty: 0,
        rejectedQty: 0,
        returnedQty: 0,
        remainingQty: 2,
        status: 'confirmed',
        supplierName: '',
        dueDate: '',
        orderDate: '',
        fileName: '',
        currency: 'KRW',
        currencyName: '원',
      },
    ])
    expect(csv).not.toMatch(/guest:/)
  })

  it('입출고는 현재고와 확정 후를 보여 준다', () => {
    expect(stockOnHandPreviewKind('post_issue')).toBe('out')
    expect(stockOnHandPreviewKind('post_outbound')).toBe('out')
    expect(stockOnHandPreviewKind('post_supplier_return')).toBe('out')
    expect(stockOnHandPreviewKind('transfer_stock')).toBeUndefined()
    expect(stockOnHandPreviewKind('post_direct_in')).toBe('in')
    expect(stockOnHandPreviewKind('post_receipt')).toBe('in')
    expect(stockOnHandPreviewKind('post_return')).toBe('in')
    expect(stockOnHandPreviewKind('adjust_stock')).toBeUndefined()
    expect(stockOnHandPreview(7, '1', 'out')).toBe('현재고 7 · 확정 후 6')
    expect(stockOnHandPreview(7, '1', 'in')).toBe('현재고 7 · 확정 후 8')
    expect(stockOnHandPreview(7, '2', 'out')).toBe('현재고 7 · 확정 후 5')
    expect(stockOnHandPreview(7, '', 'out')).toBe('현재고 7')
    expect(stockTransferOnHandPreview(7, 0, '2')).toBe(
      '보내는 현재고 7 · 확정 후 5 · 받는 현재고 0 · 확정 후 2',
    )
    expect(stockTransferOnHandPreview(7, 0, '')).toBe('보내는 현재고 7 · 받는 현재고 0')
    expect(warehouseOptionLabel({ name: '샘플창고', locationText: '3층' })).toBe('샘플창고 · 3층')
    expect(warehouseOptionLabel({ name: '샘플창고' })).toBe('샘플창고')
    expect(partnerSelectHint({ phone: '02-000-0000', memo: '샘플 공급사' })).toBe('02-000-0000 · 샘플 공급사')
    expect(partnerSelectHint({ phone: '02-000-0000', memo: '샘플 공급사', fileName: '견본거래처.pdf' })).toBe(
      '02-000-0000 · 샘플 공급사 · 견본거래처.pdf',
    )
    expect(stockQtyUnitHint('박스')).toBe('박스')
    expect(orderItemCaption({ itemName: '샘플 복사용지', itemUnit: '박스', purchaseKind: '일반 비품' })).toBe(
      '샘플 복사용지 · 박스 · 일반 비품',
    )
  })

  it('발주 목록은 확정 당시 품목명·공급사명을 쓴다', () => {
    let state = applyStockCommand(createStockState(), {
      type: 'confirm_order',
      operationId: 'op-snap',
      orderId: 'ord-snap',
      itemId: PAPER_ITEM.id,
      qty: 2,
      partnerId: 'partner-guest',
    }).state
    const order = state.orders.get('ord-snap')
    if (!order) throw new Error('발주가 없습니다.')
    state = {
      ...state,
      orders: new Map(state.orders).set('ord-snap', {
        ...order,
        partnerName: '옛문구',
        lines: [{ itemId: PAPER_ITEM.id, qty: 2, itemName: '옛복사용지', itemUnit: '박스' }],
      }),
    }
    expect(
      buildSupplyOrderList([{ ...PAPER_ITEM, name: '새복사용지' }], state, [
        { id: 'partner-guest', name: '새문구' },
      ])[0],
    ).toMatchObject({
      itemName: '옛복사용지',
      supplierName: '옛문구',
    })
  })

  it('납기가 지난 미수령 발주를 모은다', () => {
    const due = {
      orderId: 'ORD-DEMO-01',
      itemId: PAPER_ITEM.id,
      itemName: '샘플 복사용지',
      orderedQty: 2,
      receivedQty: 0,
      rejectedQty: 0,
      returnedQty: 0,
      remainingQty: 2,
      status: 'confirmed' as const,
      supplierName: '견본임대',
      dueDate: '2026-01-01',
      orderDate: '2026-09-01',
      fileName: '견본발주.pdf',
      currency: 'KRW',
      currencyName: '원',
    }
    const received = { ...due, remainingQty: 0, receivedQty: 2 }
    const later = { ...due, orderId: 'ORD-DEMO-02', dueDate: '2026-12-31' }
    expect(overdueSupplyOrders([due, received, later], '2026-10-03')).toEqual([due])
    expect(overdueSupplyOrderCaption(due)).toBe(
      'ORD-DEMO-01 · 견본임대 · 샘플 복사용지 · 견본발주.pdf · 원 · 납기 2026-01-01 · 미수령 2',
    )
    expect(overdueSupplyOrderCaption(due, '2026-10-03')).toBe(
      'ORD-DEMO-01 · 견본임대 · 샘플 복사용지 · 견본발주.pdf · 원 · 납기 2026-01-01 · 275일 · 미수령 2',
    )
    expect(overdueSupplyOrders([due], '2026-01-01')).toEqual([])
    expect(filterOrders([due, later], 'ORD-DEMO-01').map((row) => row.orderId)).toEqual(['ORD-DEMO-01'])
  })
})
