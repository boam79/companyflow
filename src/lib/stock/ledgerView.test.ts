import { describe, expect, it } from 'vitest'
import {
  applyStockCommand,
  createStockState,
} from './engine'
import { buildLedgerView, buildSupplyLedgerView, filterLedgerView, formatLedgerLink, rowsAreRelated, stockEmptyLedgerFilterLead, stockEmptyLedgerLead } from './ledgerView'

const ITEM = 'item-paper'
const MAIN = 'wh-main'
const SUB = 'wh-sub'

describe('입출고 수불부', () => {
  it('입고·출고를 한 줄씩 이으면 창고잔량이 6·10·7·8로 이어진다', () => {
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
      operationId: 'op-recv-6',
      orderId: 'ord-1',
      itemId: ITEM,
      warehouseId: MAIN,
      qty: 6,
    }).state
    state = applyStockCommand(state, {
      type: 'post_receipt',
      operationId: 'op-recv-4',
      orderId: 'ord-1',
      itemId: ITEM,
      warehouseId: MAIN,
      qty: 4,
    }).state
    state = applyStockCommand(state, {
      type: 'post_issue',
      operationId: 'op-issue-3',
      itemId: ITEM,
      warehouseId: MAIN,
      qty: 3,
      personName: '김담당',
    }).state
    state = applyStockCommand(state, {
      type: 'post_return',
      operationId: 'op-return-1',
      itemId: ITEM,
      warehouseId: MAIN,
      qty: 1,
      sourceOperationId: 'op-issue-3',
    }).state

    const rows = buildLedgerView(state)
    expect(rows.map((row) => [row.label, row.inbound, row.outbound, row.warehouseBalance])).toEqual([
      ['수령 입고', 6, null, 6],
      ['수령 입고', 4, null, 10],
      ['반출', null, 3, 7],
      ['반납 입고', 1, null, 8],
    ])
    expect(rows[3].companyBalance).toBe(8)
    expect(rows[0].link).toContain('발주 ord-1')
    expect(rows[2].link).toContain('김담당')
    expect(rowsAreRelated(rows[2].line, rows[3].line)).toBe(true)
    expect(filterLedgerView(rows, 'out')).toHaveLength(1)
    expect(filterLedgerView(rows, 'in')).toHaveLength(3)
  })

  it('연결란은 부서 id 대신 이름을 쓴다', () => {
    expect(
      formatLedgerLink(
        {
          id: 'l1',
          operationId: 'op-issue',
          txnType: 'issue',
          itemId: ITEM,
          warehouseId: MAIN,
          qtyDelta: -4,
          personName: '김담당',
          departmentId: 'dept-admin',
        },
        { departments: [{ id: 'dept-admin', name: '총무' }] },
      ),
    ).toBe('김담당 · 총무')
  })

  it('창고 이동은 회사잔량을 바꾸지 않고 출고 다음에 입고를 둔다', () => {
    let state = createStockState()
    state = applyStockCommand(state, {
      type: 'post_direct_in',
      operationId: 'op-in',
      itemId: ITEM,
      warehouseId: MAIN,
      qty: 8,
    }).state
    state = applyStockCommand(state, {
      type: 'transfer_stock',
      operationId: 'op-move',
      itemId: ITEM,
      fromWarehouseId: MAIN,
      toWarehouseId: SUB,
      qty: 2,
    }).state
    const stamped = {
      ...state,
      ledger: [
        { ...state.ledger[0], createdAt: '2026-09-17T03:07:00.000Z' },
        { ...state.ledger[2], createdAt: '2026-09-17T03:07:00.000Z' },
        { ...state.ledger[1], createdAt: '2026-09-17T03:07:00.000Z' },
      ],
    }
    const rows = buildLedgerView(stamped, {
      warehouses: [
        { id: MAIN, name: '본사창고' },
        { id: SUB, name: '부속창고' },
      ],
    })
    expect(
      rows.map((row) => [row.label, row.inbound, row.outbound, row.warehouseBalance, row.companyBalance]),
    ).toEqual([
      ['입고', 8, null, 8, 8],
      ['이동 출고', null, 2, 6, 8],
      ['이동 입고', 2, null, 2, 8],
    ])
    expect(rows[1].link).toContain('본사창고')
    expect(rows[2].link).toContain('부속창고')
  })

  it('비품 수불부는 자산화·창고 이동 줄을 빼고 잔량만 이어 준다', () => {
    let state = createStockState()
    state = applyStockCommand(state, {
      type: 'post_direct_in',
      operationId: 'op-in',
      itemId: ITEM,
      warehouseId: MAIN,
      qty: 6,
    }).state
    state = applyStockCommand(state, {
      type: 'post_issue',
      operationId: 'op-issue',
      itemId: ITEM,
      warehouseId: MAIN,
      qty: 4,
      personName: '김담당',
    }).state
    state = applyStockCommand(state, {
      type: 'convert_to_asset',
      operationId: 'op-asset',
      itemId: ITEM,
      warehouseId: MAIN,
      qty: 1,
    }).state
    state = applyStockCommand(state, {
      type: 'transfer_stock',
      operationId: 'op-move',
      itemId: ITEM,
      fromWarehouseId: MAIN,
      toWarehouseId: SUB,
      qty: 1,
    }).state
    state = applyStockCommand(state, {
      type: 'post_direct_in',
      operationId: 'op-restore',
      itemId: ITEM,
      warehouseId: MAIN,
      qty: 1,
    }).state
    const restored = {
      ...state,
      ledger: state.ledger.map((line) =>
        line.operationId === 'op-restore'
          ? { ...line, reason: '비품은 자산이 아니라 재고로 되돌림' }
          : line,
      ),
    }

    const rows = buildSupplyLedgerView(restored)
    expect(rows.map((row) => [row.label, row.inbound, row.outbound, row.companyBalance])).toEqual([
      ['입고', 6, null, 6],
      ['반출', null, 4, 2],
    ])
    expect(rows.some((row) => /자산화|본사창고|부속창고/.test(`${row.label}${row.link}`))).toBe(false)
    expect(stockEmptyLedgerLead()).not.toMatch(/아직/)
    expect(stockEmptyLedgerFilterLead()).toContain('이 구분의 입출고가 없습니다')
  })
})
