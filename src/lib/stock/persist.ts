import { assetsFromConvert } from '../asset/book'
import { assetsFromReceipt, allocateReceiptQty } from '../asset/receipt'
import { assertConvertibleItem, loadItems, writeDefaultMaster, type ItemRecord } from '../master/book'
import type { CompanySqlite } from '../sqlite/client'
import { supplyItemInsert } from './typedItem'
import {
  applyStockCommand,
  createStockState,
  type LedgerLine,
  type LedgerTxnType,
  type StockCommand,
  type StockOrder,
  type StockState,
} from './engine'

export type SqlStatement = { sql: string; params: unknown[] }

export type LedgerRow = {
  id: string
  operation_id: string
  txn_type: LedgerTxnType
  item_id: string
  warehouse_id: string
  qty_delta: number
  person_name?: string | null
  department_id?: string | null
  source_operation_id?: string | null
  order_id?: string | null
  reason?: string | null
  created_at?: string | null
}

export type OrderRow = {
  id: string
  item_id: string
  qty: number
  status: 'draft' | 'confirmed'
  operation_id: string
  partner_id?: string | null
  due_date?: string | null
}

type StockDb = Pick<CompanySqlite, 'query' | 'batch'>

export function isUniqueConstraintError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /UNIQUE constraint failed/i.test(message)
}

export function ledgerInsert(line: LedgerLine, createdAt: string): SqlStatement {
  return {
    sql: `insert into stock_ledger(
      id, operation_id, txn_type, item_id, warehouse_id, qty_delta,
      person_name, department_id, source_operation_id, order_id, reason, created_at
    ) values(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [
      line.id,
      line.operationId,
      line.txnType,
      line.itemId,
      line.warehouseId,
      line.qtyDelta,
      line.personName ?? null,
      line.departmentId ?? null,
      line.sourceOperationId ?? null,
      line.orderId ?? null,
      line.reason ?? null,
      createdAt,
    ],
  }
}

export function statementsForCommand(
  command: StockCommand,
  prev: StockState,
  next: StockState,
  createdAt: string,
): SqlStatement[] {
  const statements: SqlStatement[] = []
  if (command.type === 'draft_order' || command.type === 'confirm_order') {
    const order = next.orders.get(command.orderId)
    if (order) {
      statements.push({
        sql: `insert or replace into stock_orders(id, item_id, qty, status, partner_id, due_date, operation_id, created_at)
          values(?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [
          order.id,
          order.itemId,
          order.qty,
          order.status,
          order.partnerId ?? null,
          order.dueDate ?? null,
          command.operationId,
          createdAt,
        ],
      })
    }
  }
  const prevIds = new Set(prev.ledger.map((line) => line.id))
  for (const line of next.ledger) {
    if (!prevIds.has(line.id)) statements.push(ledgerInsert(line, createdAt))
  }
  if (command.type === 'convert_to_asset') {
    for (const asset of assetsFromConvert(
      command.operationId,
      command.itemId,
      command.warehouseId,
      command.qty,
      createdAt,
    )) {
      statements.push({
        sql: `insert into assets(id, item_id, warehouse_id, status, employee_id, source_operation_id, created_at)
          values(?, ?, ?, ?, ?, ?, ?)`,
        params: [
          asset.id,
          asset.itemId,
          asset.warehouseId,
          asset.status,
          asset.employeeId ?? null,
          asset.sourceOperationId,
          createdAt,
        ],
      })
    }
  }
  if (command.type === 'post_receipt' && command.directAsset) {
    for (const asset of assetsFromReceipt(
      command.operationId,
      command.itemId,
      command.warehouseId,
      command.qty,
      createdAt,
      command.orderId,
    )) {
      statements.push({
        sql: `insert into assets(
            id, item_id, warehouse_id, status, employee_id, source_operation_id, created_at,
            location_text, acquired_at, source_order_id
          ) values(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [
          asset.id,
          asset.itemId,
          asset.warehouseId,
          asset.status,
          null,
          asset.sourceOperationId,
          createdAt,
          asset.locationText ?? null,
          asset.acquiredAt ?? null,
          asset.sourceOrderId ?? null,
        ],
      })
    }
  }
  return statements
}

export function stateFromRows(
  orders: OrderRow[],
  ledger: LedgerRow[],
  processedIds: string[],
): StockState {
  const state = createStockState()
  for (const id of processedIds) state.processed.set(id, 'applied')
  for (const order of orders) {
    const row: StockOrder = {
      id: order.id,
      itemId: order.item_id,
      qty: order.qty,
      status: order.status,
      partnerId: order.partner_id ?? undefined,
      dueDate: order.due_date ?? undefined,
    }
    state.orders.set(order.id, row)
    state.processed.set(order.operation_id, 'applied')
  }
  for (const row of ledger) {
    const line: LedgerLine = {
      id: row.id,
      operationId: row.operation_id,
      txnType: row.txn_type,
      itemId: row.item_id,
      warehouseId: row.warehouse_id,
      qtyDelta: row.qty_delta,
      personName: row.person_name ?? undefined,
      departmentId: row.department_id ?? undefined,
      sourceOperationId: row.source_operation_id ?? undefined,
      orderId: row.order_id ?? undefined,
      reason: row.reason ?? undefined,
      createdAt: row.created_at ?? undefined,
    }
    state.ledger.push(line)
    state.processed.set(row.operation_id, 'applied')
  }
  return state
}

export async function loadStockState(db: Pick<CompanySqlite, 'query'>): Promise<StockState> {
  const [orders, ledger, processed] = await Promise.all([
    db.query<OrderRow>('select id, item_id, qty, status, partner_id, due_date, operation_id from stock_orders'),
    db.query<LedgerRow>(
      `select id, operation_id, txn_type, item_id, warehouse_id, qty_delta,
        person_name, department_id, source_operation_id, order_id, reason, created_at
       from stock_ledger order by created_at, id`,
    ),
    db.query<{ operation_id: string }>('select operation_id from processed_operations'),
  ])
  return stateFromRows(
    orders,
    ledger,
    processed.map((row) => row.operation_id),
  )
}

export async function executeStockCommand(
  db: StockDb,
  command: StockCommand,
  createdAt = new Date().toISOString(),
  options?: { newItem?: ItemRecord },
): Promise<{ status: 'applied' | 'duplicate'; state: StockState }> {
  if (command.type === 'convert_to_asset') {
    const items = await loadItems(db)
    assertConvertibleItem(items.find((item) => item.id === command.itemId))
  }
  let nextCommand = command
  if (command.type === 'post_receipt') {
    const items = await loadItems(db)
    const allocation = allocateReceiptQty(
      items.find((item) => item.id === command.itemId) ?? options?.newItem,
      command.qty,
    )
    nextCommand = { ...command, directAsset: allocation.assetQty > 0 }
  }
  const prev = await loadStockState(db)
  const result = applyStockCommand(prev, nextCommand)
  if (result.status === 'duplicate') return result

  const statements: SqlStatement[] = [
    ...(options?.newItem ? [supplyItemInsert(options.newItem, createdAt)] : []),
    {
      sql: 'insert into processed_operations(operation_id, result_json, created_at) values(?, ?, ?)',
      params: [nextCommand.operationId, JSON.stringify({ type: nextCommand.type }), createdAt],
    },
    ...statementsForCommand(nextCommand, prev, result.state, createdAt),
    {
      sql: 'insert into audit_events(id, action, detail_json, created_at) values(?, ?, ?, ?)',
      params: [
        `${command.operationId}:audit`,
        command.type,
        JSON.stringify({ operationId: command.operationId, type: command.type }),
        createdAt,
      ],
    },
  ]

  try {
    await db.batch(statements)
    return result
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const again = await loadStockState(db)
      return { status: 'duplicate', state: again }
    }
    throw error
  }
}

export async function ensureDefaultStockMaster(db: Pick<CompanySqlite, 'exec'>): Promise<void> {
  await writeDefaultMaster(db)
}
