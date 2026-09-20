import { describe, expect, it } from 'vitest'
import { COMPANY_ASSET_ITEMS, PAPER_ITEM } from '../master/book'
import { applyStockCommand, createStockState } from './engine'
import {
  buildAssetOrderList,
  buildSupplyInventory,
  buildSupplyOrderList,
  orderRemainingCaption,
  resolveOrderPartnerId,
  supplyItems,
  supplyOrderCsv,
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
    expect(buildSupplyInventory(items, WAREHOUSES, state)).toEqual([
      {
        itemId: 'item-paper',
        itemName: '복사용지',
        quantities: [5, 2],
        total: 7,
      },
    ])
  })

  it('현재고 안내는 고른 품목 발주만 붙인다', () => {
    const paper = { itemId: 'item-paper', itemName: '복사용지', quantities: [8], total: 8 }
    const clip = { itemId: 'item-clip', itemName: '클립', quantities: [2], total: 2 }
    const paperOrder = { id: 'ord-paper', itemId: 'item-paper', qty: 10, status: 'confirmed' as const }
    expect(orderRemainingCaption(paper, paperOrder, 0)).toBe(' · 발주 ord-paper 잔량 0')
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
        remainingQty: 4,
        status: 'confirmed',
        supplierName: '',
        dueDate: '',
        orderDate: '',
        fileName: '',
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
        supplierName: '',
        dueDate: '',
        orderDate: '',
        fileName: '',
      },
    ])
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
        remainingQty: 10,
        status: 'confirmed',
        partnerId: 'partner-mfp',
        supplierName: '사무기기코리아',
        dueDate: '',
        orderDate: '',
        fileName: '',
      },
    ])
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
    expect(csv).toContain('발주번호,품목,공급사,발주일,납기,첨부,발주,수령,잔량,상태')
    expect(csv).toContain('ord-paper,복사용지,,,,,10,0,10,확정')
  })
})
