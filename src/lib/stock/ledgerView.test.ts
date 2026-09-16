import { describe, expect, it } from 'vitest'
import {
  applyStockCommand,
  createStockState,
} from './engine'
import { buildLedgerView, filterLedgerView, formatLedgerLink, rowsAreRelated } from './ledgerView'

const ITEM = 'item-paper'
const MAIN = 'wh-main'

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
})
