import { describe, expect, it } from 'vitest'
import {
  applyStockCommand,
  createStockState,
  companyOnHand,
  onHand,
} from './engine'
import {
  isUniqueConstraintError,
  statementsForCommand,
  stateFromRows,
} from './persist'

const ITEM = 'item-paper'
const MAIN = 'wh-main'
const SUB = 'wh-sub'

describe('재고 영속 묶음', () => {
  it('이동은 출고·입고 두 줄을 한 묶음으로 만든다', () => {
    let state = createStockState()
    state = applyStockCommand(state, {
      type: 'post_direct_in',
      operationId: 'op-in',
      itemId: ITEM,
      warehouseId: MAIN,
      qty: 8,
    }).state
    const moved = applyStockCommand(state, {
      type: 'transfer_stock',
      operationId: 'op-move',
      itemId: ITEM,
      fromWarehouseId: MAIN,
      toWarehouseId: SUB,
      qty: 2,
    })
    const statements = statementsForCommand(
      {
        type: 'transfer_stock',
        operationId: 'op-move',
        itemId: ITEM,
        fromWarehouseId: MAIN,
        toWarehouseId: SUB,
        qty: 2,
      },
      state,
      moved.state,
      '2026-09-16T00:00:00.000Z',
    )
    expect(statements).toHaveLength(2)
    expect(statements.every((stmt) => stmt.sql.includes('insert into stock_ledger'))).toBe(true)
    expect(statements[0].params[5]).toBe(-2)
    expect(statements[1].params[5]).toBe(2)
    expect(companyOnHand(moved.state, ITEM)).toBe(8)
  })

  it('원장 행에서 현재고를 다시 계산한다', () => {
    const state = stateFromRows(
      [],
      [
        {
          id: 'a',
          operation_id: 'op-1',
          txn_type: 'direct_in',
          item_id: ITEM,
          warehouse_id: MAIN,
          qty_delta: 10,
        },
        {
          id: 'b',
          operation_id: 'op-2',
          txn_type: 'issue',
          item_id: ITEM,
          warehouse_id: MAIN,
          qty_delta: -3,
          person_name: '김담당',
        },
        {
          id: 'c',
          operation_id: 'op-3',
          txn_type: 'return',
          item_id: ITEM,
          warehouse_id: MAIN,
          qty_delta: 1,
          source_operation_id: 'op-2',
        },
      ],
      ['op-1', 'op-2', 'op-3'],
    )
    expect(onHand(state, ITEM, MAIN)).toBe(8)
    expect(state.processed.has('op-2')).toBe(true)
  })

  it('UNIQUE 오류만 중복으로 본다', () => {
    expect(isUniqueConstraintError(new Error('UNIQUE constraint failed: processed_operations.operation_id'))).toBe(
      true,
    )
    expect(isUniqueConstraintError(new Error('NOT NULL constraint failed'))).toBe(false)
  })

  it('자산화는 원장 출고와 자산 행을 한 묶음으로 만든다', () => {
    let state = createStockState()
    state = applyStockCommand(state, {
      type: 'post_direct_in',
      operationId: 'op-in',
      itemId: ITEM,
      warehouseId: MAIN,
      qty: 7,
    }).state
    const converted = applyStockCommand(state, {
      type: 'convert_to_asset',
      operationId: 'op-asset',
      itemId: ITEM,
      warehouseId: MAIN,
      qty: 2,
    })
    const statements = statementsForCommand(
      {
        type: 'convert_to_asset',
        operationId: 'op-asset',
        itemId: ITEM,
        warehouseId: MAIN,
        qty: 2,
      },
      state,
      converted.state,
      '2026-09-17T00:00:00.000Z',
    )
    expect(statements.filter((stmt) => stmt.sql.includes('stock_ledger'))).toHaveLength(1)
    expect(statements.filter((stmt) => stmt.sql.includes('insert into assets'))).toHaveLength(2)
    expect(companyOnHand(converted.state, ITEM)).toBe(5)
  })

  it('가구 수령은 현재고 없이 자산 행만 만든다', () => {
    let state = createStockState()
    state = applyStockCommand(state, {
      type: 'confirm_order',
      operationId: 'op-desk-order',
      orderId: 'ord-desk',
      itemId: 'item-desk',
      qty: 2,
    }).state
    const received = applyStockCommand(state, {
      type: 'post_receipt',
      operationId: 'op-desk-recv',
      orderId: 'ord-desk',
      itemId: 'item-desk',
      warehouseId: MAIN,
      qty: 2,
      directAsset: true,
    })
    const statements = statementsForCommand(
      {
        type: 'post_receipt',
        operationId: 'op-desk-recv',
        orderId: 'ord-desk',
        itemId: 'item-desk',
        warehouseId: MAIN,
        qty: 2,
        directAsset: true,
      },
      state,
      received.state,
      '2026-09-20T00:00:00.000Z',
    )
    expect(statements.filter((stmt) => stmt.sql.includes('stock_ledger'))).toHaveLength(2)
    expect(statements.filter((stmt) => stmt.sql.includes('insert into assets'))).toHaveLength(2)
    expect(companyOnHand(received.state, 'item-desk')).toBe(0)
  })

  it('발주 SQL에 공급사와 납기를 넣고 다시 읽는다', () => {
    const prev = createStockState()
    const command = {
      type: 'confirm_order' as const,
      operationId: 'op-paper',
      orderId: 'ord-paper',
      itemId: ITEM,
      qty: 10,
      partnerId: 'partner-mfp',
      dueDate: '2026-09-27',
      orderDate: '2026-09-20',
    }
    const next = applyStockCommand(prev, command).state
    const statements = statementsForCommand(command, prev, next, '2026-09-20T00:00:00.000Z')
    expect(statements[0]?.sql).toContain('order_date')
    expect(statements[0]?.params).toEqual([
      'ord-paper',
      ITEM,
      10,
      'confirmed',
      'partner-mfp',
      '2026-09-27',
      '2026-09-20',
      'op-paper',
      '2026-09-20T00:00:00.000Z',
    ])
    const restored = stateFromRows(
      [
        {
          id: 'ord-paper',
          item_id: ITEM,
          qty: 10,
          status: 'confirmed',
          operation_id: 'op-paper',
          partner_id: 'partner-mfp',
          due_date: '2026-09-27',
          order_date: '2026-09-20',
        },
      ],
      [],
      [],
    )
    expect(restored.orders.get('ord-paper')?.partnerId).toBe('partner-mfp')
    expect(restored.orders.get('ord-paper')?.dueDate).toBe('2026-09-27')
    expect(restored.orders.get('ord-paper')?.orderDate).toBe('2026-09-20')
  })
})
