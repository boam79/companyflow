import { assetsFromConvert } from '../asset/book'
import { assetsFromReceipt, allocateReceiptQty } from '../asset/receipt'
import { assertContractFile, base64ToBytes, bytesToBase64 } from '../contracts/book'
import { assertConvertibleItem, loadItems, writeDefaultMaster, type ItemRecord } from '../master/book'
import { purchaseKindLabel } from '../master/commands'
import type { CompanySqlite } from '../sqlite/client'
import { supplyItemInsert } from './typedItem'
import { assertOrderFitsRequest, loadPurchaseRequests } from './request'
import {
  applyStockCommand,
  createStockState,
  ledgerCatalogFields,
  resolveOrderLines,
  stockOrderLines,
  type LedgerLine,
  type LedgerTxnType,
  type StockCommand,
  type StockOrder,
  type StockOrderLine,
  type StockState,
} from './engine'
import { loadStockPolicy, stockCommandReason } from './policy'

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
  partner_id?: string | null
  purpose?: string | null
  due_return_at?: string | null
  business_date?: string | null
  memo?: string | null
  file_name?: string | null
  file_mime?: string | null
  file_base64?: string | null
  department_name?: string | null
  recorded_by?: string | null
  item_name?: string | null
  item_unit?: string | null
  purchase_kind?: string | null
  warehouse_name?: string | null
  partner_name?: string | null
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
  order_date?: string | null
  file_name?: string | null
  file_mime?: string | null
  file_base64?: string | null
  currency?: string | null
  request_id?: string | null
}

export type OrderLineRow = {
  order_id: string
  item_id: string
  qty: number
}

type StockDb = Pick<CompanySqlite, 'query' | 'batch'>

export function isUniqueConstraintError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /UNIQUE constraint failed/i.test(message)
}

export function orderAttachment(file: { name: string; mime?: string; bytes: Uint8Array }) {
  const fileMime = assertContractFile(file.bytes.byteLength, file.mime, file.name, file.bytes)
  return {
    fileName: file.name.trim() || '발주첨부',
    fileMime,
    fileBase64: bytesToBase64(file.bytes),
  }
}

export function ledgerAttachment(file: { name: string; mime?: string; bytes: Uint8Array }) {
  return orderAttachment({ ...file, name: file.name.trim() || '수불첨부' })
}

export type LedgerCatalog = {
  items: { id: string; name: string; unit?: string; purchaseKind?: string }[]
  warehouses: { id: string; name: string }[]
  partners: { id: string; name: string }[]
  purchaseKinds: { id: string; name: string }[]
}

export function stampLedgerCatalog(line: LedgerLine, catalog: LedgerCatalog): LedgerLine {
  const item = catalog.items.find((row) => row.id === line.itemId)
  const warehouse = catalog.warehouses.find((row) => row.id === line.warehouseId)
  const partner = line.partnerId
    ? catalog.partners.find((row) => row.id === line.partnerId)
    : undefined
  const kind = item
    ? purchaseKindLabel(item.purchaseKind, catalog.purchaseKinds)
    : undefined
  return {
    ...line,
    ...ledgerCatalogFields({
      itemName: line.itemName || item?.name,
      itemUnit: line.itemUnit || item?.unit || (item ? '개' : undefined),
      purchaseKind: line.purchaseKind || kind,
      warehouseName: line.warehouseName || warehouse?.name,
      partnerName: line.partnerName || partner?.name,
    }),
  }
}

export function stampNewLedgerLines(prev: StockState, next: StockState, catalog: LedgerCatalog): StockState {
  const prevIds = new Set(prev.ledger.map((line) => line.id))
  return {
    ...next,
    ledger: next.ledger.map((line) => (prevIds.has(line.id) ? line : stampLedgerCatalog(line, catalog))),
  }
}

export function ledgerInsert(line: LedgerLine, createdAt: string): SqlStatement {
  return {
    sql: `insert into stock_ledger(
      id, operation_id, txn_type, item_id, warehouse_id, qty_delta,
      person_name, department_id, source_operation_id, order_id, reason,
      partner_id, purpose, due_return_at, business_date, memo,
      file_name, file_mime, file_base64, department_name, recorded_by,
      item_name, item_unit, purchase_kind, warehouse_name, partner_name, created_at
    ) values(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      line.partnerId ?? null,
      line.purpose ?? null,
      line.dueReturnAt ?? null,
      line.businessDate ?? null,
      line.memo ?? null,
      line.fileName ?? null,
      line.fileMime ?? null,
      line.fileBase64 ?? null,
      line.departmentName ?? null,
      line.recordedBy ?? null,
      line.itemName ?? null,
      line.itemUnit ?? null,
      line.purchaseKind ?? null,
      line.warehouseName ?? null,
      line.partnerName ?? null,
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
        sql: `insert or replace into stock_orders(
            id, item_id, qty, status, partner_id, due_date, order_date, currency,
            file_name, file_mime, file_base64, request_id, operation_id, created_at)
          values(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [
          order.id,
          order.itemId,
          order.qty,
          order.status,
          order.partnerId ?? null,
          order.dueDate ?? null,
          order.orderDate ?? null,
          order.currency ?? 'KRW',
          order.fileName ?? null,
          order.fileMime ?? null,
          order.fileBase64 ?? null,
          order.requestId ?? null,
          command.operationId,
          createdAt,
        ],
      })
      statements.push({
        sql: 'delete from stock_order_lines where order_id = ?',
        params: [order.id],
      })
      for (const line of stockOrderLines(order)) {
        statements.push({
          sql: 'insert into stock_order_lines(order_id, item_id, qty) values(?, ?, ?)',
          params: [order.id, line.itemId, line.qty],
        })
      }
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
        sql: `insert into assets(id, item_id, warehouse_id, status, employee_id, source_operation_id, created_at, qr_token)
          values(?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [
          asset.id,
          asset.itemId,
          asset.warehouseId,
          asset.status,
          asset.employeeId ?? null,
          asset.sourceOperationId,
          createdAt,
          asset.qrToken ?? null,
        ],
      })
      if (asset.qrToken) {
        statements.push({
          sql: `insert or ignore into qr_labels(id, status, created_at, asset_id) values(?, 'bound', ?, ?)`,
          params: [asset.qrToken, createdAt, asset.id],
        })
      }
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
            location_text, acquired_at, source_order_id, qr_token
          ) values(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          asset.qrToken ?? null,
        ],
      })
      if (asset.qrToken) {
        statements.push({
          sql: `insert or ignore into qr_labels(id, status, created_at, asset_id) values(?, 'bound', ?, ?)`,
          params: [asset.qrToken, createdAt, asset.id],
        })
      }
    }
  }
  return statements
}

export function stateFromRows(
  orders: OrderRow[],
  ledger: LedgerRow[],
  processedIds: string[],
  lineRows: OrderLineRow[] = [],
): StockState {
  const state = createStockState()
  for (const id of processedIds) state.processed.set(id, 'applied')
  const linesByOrder = new Map<string, StockOrderLine[]>()
  for (const row of lineRows) {
    const list = linesByOrder.get(row.order_id) ?? []
    list.push({ itemId: row.item_id, qty: row.qty })
    linesByOrder.set(row.order_id, list)
  }
  for (const order of orders) {
    const lines = linesByOrder.get(order.id)
    const row: StockOrder = {
      id: order.id,
      itemId: order.item_id,
      qty: order.qty,
      ...(lines?.length ? { lines } : {}),
      status: order.status,
      partnerId: order.partner_id ?? undefined,
      dueDate: order.due_date ?? undefined,
      orderDate: order.order_date ?? undefined,
      fileName: order.file_name ?? undefined,
      fileMime: order.file_mime ?? undefined,
      fileBase64: order.file_base64 ?? undefined,
      currency: order.currency ?? undefined,
      requestId: order.request_id ?? undefined,
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
      partnerId: row.partner_id ?? undefined,
      purpose: row.purpose ?? undefined,
      dueReturnAt: row.due_return_at ?? undefined,
      businessDate: row.business_date ?? undefined,
      memo: row.memo ?? undefined,
      fileName: row.file_name ?? undefined,
      fileMime: row.file_mime ?? undefined,
      fileBase64: row.file_base64 ?? undefined,
      departmentName: row.department_name ?? undefined,
      recordedBy: row.recorded_by ?? undefined,
      itemName: row.item_name ?? undefined,
      itemUnit: row.item_unit ?? undefined,
      purchaseKind: row.purchase_kind ?? undefined,
      warehouseName: row.warehouse_name ?? undefined,
      partnerName: row.partner_name ?? undefined,
      createdAt: row.created_at ?? undefined,
    }
    state.ledger.push(line)
    state.processed.set(row.operation_id, 'applied')
  }
  return state
}

export async function loadStockState(db: Pick<CompanySqlite, 'query'>): Promise<StockState> {
  const [orders, ledger, processed, lineRows] = await Promise.all([
    db.query<OrderRow>(
      `select id, item_id, qty, status, partner_id, due_date, order_date, currency,
        file_name, file_mime, file_base64, request_id, operation_id from stock_orders`,
    ),
    db.query<LedgerRow>(
      `select id, operation_id, txn_type, item_id, warehouse_id, qty_delta,
        person_name, department_id, source_operation_id, order_id, reason,
        partner_id, purpose, due_return_at, business_date, memo,
        file_name, file_mime, file_base64, department_name, recorded_by,
        item_name, item_unit, purchase_kind, warehouse_name, partner_name, created_at
       from stock_ledger order by created_at, id`,
    ),
    db.query<{ operation_id: string }>('select operation_id from processed_operations'),
    db.query<OrderLineRow>('select order_id, item_id, qty from stock_order_lines order by order_id, item_id'),
  ])
  return stateFromRows(
    orders,
    ledger,
    processed.map((row) => row.operation_id),
    lineRows,
  )
}

export async function loadLedgerOriginal(
  db: Pick<CompanySqlite, 'query'>,
  lineId: string,
) {
  const rows = await db.query<{
    file_name?: string | null
    file_mime?: string | null
    file_base64?: string | null
  }>('select file_name, file_mime, file_base64 from stock_ledger where id = ?', [lineId])
  const row = rows[0]
  if (!row?.file_base64 || !row.file_name) throw new Error('수불 첨부가 없습니다.')
  return {
    fileName: row.file_name,
    fileMime: row.file_mime || 'application/octet-stream',
    bytes: base64ToBytes(row.file_base64),
  }
}

export async function loadOrderOriginal(
  db: Pick<CompanySqlite, 'query'>,
  orderId: string,
) {
  const rows = await db.query<{
    file_name?: string | null
    file_mime?: string | null
    file_base64?: string | null
  }>('select file_name, file_mime, file_base64 from stock_orders where id = ?', [orderId])
  const row = rows[0]
  if (!row?.file_base64 || !row.file_name) throw new Error('발주 첨부가 없습니다.')
  return {
    fileName: row.file_name,
    fileMime: row.file_mime || 'application/octet-stream',
    bytes: base64ToBytes(row.file_base64),
  }
}

export async function executeStockCommand(
  db: StockDb,
  command: StockCommand,
  createdAt = new Date().toISOString(),
  options?: { newItem?: ItemRecord; newItems?: ItemRecord[] },
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
  if (nextCommand.type === 'draft_order' || nextCommand.type === 'confirm_order') {
    const existing = prev.orders.get(nextCommand.orderId)
    const requestId =
      nextCommand.requestId !== undefined ? nextCommand.requestId || undefined : existing?.requestId
    if (requestId) {
      const request = (await loadPurchaseRequests(db)).find((row) => row.id === requestId)
      if (!request) throw new Error('연결한 구매요청이 없습니다.')
      assertOrderFitsRequest({
        request,
        orders: [...prev.orders.values()],
        lines: resolveOrderLines(nextCommand, existing),
        exceptOrderId: nextCommand.orderId,
      })
    }
  }
  const policy = await loadStockPolicy(db)
  const result = applyStockCommand(prev, nextCommand, policy)
  if (result.status === 'duplicate') return result
  const overflowReason = stockCommandReason(nextCommand)

  const createdItems = [
    ...(options?.newItem ? [options.newItem] : []),
    ...(options?.newItems ?? []).filter((item) => item.id !== options?.newItem?.id),
  ]
  const [itemRows, warehouses, partners, purchaseKinds] = await Promise.all([
    loadItems(db),
    db.query<{ id: string; name: string }>('select id, name from warehouses'),
    db.query<{ id: string; name: string }>('select id, name from partners'),
    db.query<{ id: string; name: string }>('select id, name from purchase_kinds'),
  ])
  const catalog: LedgerCatalog = {
    items: [
      ...itemRows,
      ...createdItems.filter((item) => !itemRows.some((row) => row.id === item.id)),
    ],
    warehouses,
    partners,
    purchaseKinds,
  }
  const stamped = stampNewLedgerLines(prev, result.state, catalog)
  const statements: SqlStatement[] = [
    ...createdItems.map((item) => supplyItemInsert(item, createdAt)),
    {
      sql: 'insert into processed_operations(operation_id, result_json, created_at) values(?, ?, ?)',
      params: [nextCommand.operationId, JSON.stringify({ type: nextCommand.type }), createdAt],
    },
    ...statementsForCommand(nextCommand, prev, stamped, createdAt),
    {
      sql: 'insert into audit_events(id, action, detail_json, created_at) values(?, ?, ?, ?)',
      params: [
        `${command.operationId}:audit`,
        command.type,
        JSON.stringify({
          operationId: command.operationId,
          type: command.type,
          ...(overflowReason ? { reason: overflowReason } : {}),
        }),
        createdAt,
      ],
    },
  ]

  try {
    await db.batch(statements)
    return { status: result.status, state: stamped }
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const again = await loadStockState(db)
      return { status: 'duplicate', state: again }
    }
    throw error
  }
}

export async function ensureDefaultStockMaster(
  db: Pick<CompanySqlite, 'exec' | 'query'>,
  companyCode?: string | null,
): Promise<void> {
  await writeDefaultMaster(db, { companyCode })
}
