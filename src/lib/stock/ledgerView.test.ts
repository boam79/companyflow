import { describe, expect, it } from 'vitest'
import {
  applyStockCommand,
  createStockState,
} from './engine'
import { buildLedgerView, buildSupplyLedgerView, filterLedgerView, formatLedgerLink, ledgerRelatedJumps, publicItemLabel, rowsAreRelated, stockEmptyLedgerFilterLead, stockEmptyLedgerLead } from './ledgerView'

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
    const fromReturn = ledgerRelatedJumps(state.ledger, rows[3].line)
    expect(fromReturn.map((jump) => [jump.button, jump.caption])).toEqual([['원거래로', '반출 · 김담당']])
    expect(fromReturn[0].caption).not.toMatch(/op-issue|aaaaaaaa|[0-9a-f]{8}-/)
    const fromIssue = ledgerRelatedJumps(state.ledger, rows[2].line)
    expect(fromIssue.map((jump) => jump.button)).toEqual(['반납으로'])
    expect(ledgerRelatedJumps(state.ledger, rows[0].line)).toEqual([])
    state = applyStockCommand(state, {
      type: 'reverse_transaction',
      operationId: 'op-rev',
      sourceOperationId: 'op-recv-6',
    }).state
    const reversed = state.ledger.find((line) => line.txnType === 'reversal')
    expect(reversed).toBeTruthy()
    const fromReversal = ledgerRelatedJumps(state.ledger, reversed ?? null)
    expect(fromReversal.map((jump) => jump.button)).toEqual(['원거래로'])
    expect(fromReversal[0].caption).toBe('수령 입고')
    const fromReceipt = ledgerRelatedJumps(
      state.ledger,
      state.ledger.find((line) => line.operationId === 'op-recv-6') ?? null,
    )
    expect(fromReceipt.map((jump) => jump.button)).toEqual(['정정으로'])
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
    expect(
      formatLedgerLink(
        {
          id: 'l-note',
          operationId: 'op-in-note',
          txnType: 'direct_in',
          itemId: ITEM,
          warehouseId: MAIN,
          qtyDelta: 1,
          partnerId: 'partner-guest',
          purpose: '샘플 보충',
          businessDate: '2026-10-01',
          memo: '샘플 메모',
          fileName: '견본입고.png',
          fileBase64: 'iVBORw0KGgo=',
        },
        { partners: [{ id: 'partner-guest', name: '견본문구' }] },
      ),
    ).toBe('견본문구 · 샘플 보충 · 입고 2026-10-01 · 샘플 메모 · 견본입고.png')
    expect(
      formatLedgerLink({
        id: 'l-note',
        operationId: 'op-in-note',
        txnType: 'direct_in',
        itemId: ITEM,
        warehouseId: MAIN,
        qtyDelta: 1,
        partnerId: 'partner-guest',
        purpose: '샘플 보충',
        businessDate: '2026-10-01',
        memo: '샘플 메모',
        fileName: '견본입고.png',
        fileBase64: 'iVBORw0KGgo=',
      }),
    ).not.toMatch(/iVBORw0KGgo/)
    expect(
      formatLedgerLink({
        id: 'l-issue-note',
        operationId: 'op-issue-note',
        txnType: 'issue',
        itemId: ITEM,
        warehouseId: MAIN,
        qtyDelta: -1,
        personName: '견본 김대리',
        purpose: '샘플 청소',
        dueReturnAt: '2026-10-10',
        partnerId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
        fileName: '견본반출.png',
      }),
    ).toBe('견본 김대리 · 샘플 청소 · 반납 예정 2026-10-10 · 견본반출.png')
    expect(
      formatLedgerLink({
        id: 'l2',
        operationId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
        txnType: 'return',
        itemId: ITEM,
        warehouseId: MAIN,
        qtyDelta: 1,
        sourceOperationId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      }),
    ).not.toMatch(/aaaaaaaa|원거래 aaaaaaaa/)
    expect(
      formatLedgerLink(
        {
          id: 'l-back',
          operationId: 'op-back',
          txnType: 'supplier_return',
          itemId: ITEM,
          warehouseId: MAIN,
          qtyDelta: -1,
          sourceOperationId: 'guest:paper-in',
          partnerId: 'partner-guest',
        },
        { partners: [{ id: 'partner-guest', name: '견본문구' }] },
      ),
    ).toBe('원입고 · 견본문구')
    expect(
      formatLedgerLink({
        id: 'l-back',
        operationId: 'op-back',
        txnType: 'supplier_return',
        itemId: ITEM,
        warehouseId: MAIN,
        qtyDelta: -1,
        sourceOperationId: 'guest:paper-in',
      }),
    ).not.toMatch(/guest:paper|원거래/)
    expect(
      formatLedgerLink({
        id: 'l3',
        operationId: 'op-recv',
        txnType: 'receipt',
        itemId: ITEM,
        warehouseId: MAIN,
        qtyDelta: 1,
        orderId: 'guest:desk-1',
        sourceOperationId: 'guest:paper-in',
      }),
    ).not.toMatch(/guest:desk|guest:paper|원거래/)
    expect(publicItemLabel('복사용지', 'item-paper')).toBe('복사용지')
    expect(publicItemLabel('item-d2361da5-1d84-4f31-b43b-9e8ad4cc4bc2')).toBe('비품')
    expect(publicItemLabel('', 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee')).toBe('비품')
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
