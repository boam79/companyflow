import type { ProcessResult } from '../idempotency'
import { formatCompanyMoney } from '../company/displayCurrency'
import type { ItemRecord } from '../master/book'
import type { CompanySqlite } from '../sqlite/client'
import { stockOrderLines, type StockOrder, type StockOrderLine } from './engine'
import { supplyItemInsert } from './typedItem'

type SqlStatement = { sql: string; params: unknown[] }

function isUniqueConstraintError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return /UNIQUE constraint failed/i.test(message)
}

export type PurchaseRequestLine = {
  itemId: string
  qty: number
  unitPrice?: number
}

export type PurchaseRequest = {
  id: string
  requesterName: string
  departmentId?: string
  departmentName?: string
  neededAt?: string
  purpose?: string
  status: 'open'
  lines: PurchaseRequestLine[]
  createdAt?: string
}

export type PurchaseRequestInput = {
  id: string
  requesterName: string
  departmentId?: string
  departmentName?: string
  neededAt?: string
  purpose?: string
  lines: PurchaseRequestLine[]
}

type RequestRow = {
  id: string
  requester_name: string
  department_id?: string | null
  department_name?: string | null
  needed_at?: string | null
  purpose?: string | null
  status: string
  created_at?: string | null
}

type RequestLineRow = {
  request_id: string
  item_id: string
  qty: number
  unit_price?: number | null
}

type RequestDb = Pick<CompanySqlite, 'query' | 'batch'>

export const REQUEST_TABLE_SQL = [
  `create table if not exists purchase_requests (
    id text primary key,
    requester_name text not null,
    department_id text,
    department_name text,
    needed_at text,
    purpose text,
    status text not null default 'open',
    operation_id text not null unique,
    created_at text not null
  );`,
  `create table if not exists purchase_request_lines (
    request_id text not null,
    item_id text not null,
    qty integer not null,
    unit_price integer,
    primary key (request_id, item_id)
  );`,
]

export function newPurchaseRequestId(now = new Date()) {
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
  const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 4).toUpperCase()
  return `REQ-${ymd}-${suffix}`
}

export function requestLineAmount(line: PurchaseRequestLine) {
  if (line.unitPrice == null) return undefined
  return line.qty * line.unitPrice
}

export function requestTotalAmount(lines: PurchaseRequestLine[]) {
  const amounts = lines.map(requestLineAmount).filter((value): value is number => value != null)
  if (!amounts.length) return undefined
  return amounts.reduce((sum, value) => sum + value, 0)
}

export function requestAmountText(amount?: number, grouping = true, currency = 'KRW') {
  if (amount == null) return ''
  return formatCompanyMoney(amount, grouping, currency)
}

export function applyPurchaseRequest(input: PurchaseRequestInput): PurchaseRequest {
  const id = input.id.trim()
  if (!id) throw new Error('요청 번호가 필요합니다.')
  const requesterName = input.requesterName.trim()
  if (!requesterName) throw new Error('요청자가 필요합니다.')
  const lines: PurchaseRequestLine[] = []
  const seen = new Set<string>()
  for (const line of input.lines ?? []) {
    if (!line.itemId || !(line.qty > 0)) continue
    if (seen.has(line.itemId)) throw new Error('같은 품목은 한 줄로 모으세요.')
    if (line.unitPrice != null && line.unitPrice < 0) throw new Error('단가는 0 이상이어야 합니다.')
    seen.add(line.itemId)
    lines.push({
      itemId: line.itemId,
      qty: line.qty,
      ...(line.unitPrice != null ? { unitPrice: line.unitPrice } : {}),
    })
  }
  if (!lines.length) throw new Error('요청 품목과 수량이 필요합니다.')
  return {
    id,
    requesterName,
    departmentId: input.departmentId?.trim() || undefined,
    departmentName: input.departmentName?.trim() || undefined,
    neededAt: input.neededAt?.trim() || undefined,
    purpose: input.purpose?.trim() || undefined,
    status: 'open',
    lines,
  }
}

export function requestOrderedQty(
  orders: Pick<StockOrder, 'id' | 'itemId' | 'qty' | 'lines' | 'requestId'>[],
  requestId: string,
  itemId: string,
  exceptOrderId?: string,
) {
  return orders
    .filter((order) => order.requestId === requestId && order.id !== exceptOrderId)
    .reduce(
      (sum, order) =>
        sum +
        stockOrderLines(order)
          .filter((line) => line.itemId === itemId)
          .reduce((lineSum, line) => lineSum + line.qty, 0),
      0,
    )
}

export function requestRemainingQty(
  request: PurchaseRequest,
  orders: Pick<StockOrder, 'id' | 'itemId' | 'qty' | 'lines' | 'requestId'>[],
  itemId: string,
  exceptOrderId?: string,
) {
  const wanted = request.lines.find((line) => line.itemId === itemId)
  if (!wanted) return 0
  return Math.max(0, wanted.qty - requestOrderedQty(orders, request.id, itemId, exceptOrderId))
}

export function requestHasRemaining(
  request: PurchaseRequest,
  orders: Pick<StockOrder, 'id' | 'itemId' | 'qty' | 'lines' | 'requestId'>[],
) {
  return request.lines.some((line) => requestRemainingQty(request, orders, line.itemId) > 0)
}

export function assertOrderFitsRequest(input: {
  request: PurchaseRequest
  orders: Pick<StockOrder, 'id' | 'itemId' | 'qty' | 'lines' | 'requestId'>[]
  lines: StockOrderLine[]
  exceptOrderId?: string
}) {
  for (const line of input.lines) {
    const wanted = input.request.lines.find((row) => row.itemId === line.itemId)
    if (!wanted) throw new Error('요청에 없는 품목은 이 요청으로 발주할 수 없습니다.')
    const remaining = requestRemainingQty(input.request, input.orders, line.itemId, input.exceptOrderId)
    if (line.qty > remaining) throw new Error('요청 잔량을 초과해 발주할 수 없습니다.')
  }
}

export function requestCaption(
  row: PurchaseRequest,
  items: Pick<ItemRecord, 'id' | 'name'>[],
) {
  const itemPart = row.lines
    .map((line) => {
      const name = items.find((item) => item.id === line.itemId)?.name ?? line.itemId
      return `${name} ${line.qty}`
    })
    .join(', ')
  const amount = requestAmountText(requestTotalAmount(row.lines))
  return [row.requesterName, row.departmentName, row.neededAt ? `필요 ${row.neededAt}` : '', itemPart, amount]
    .filter(Boolean)
    .join(' · ')
}

export function requestSelectLabel(
  row: PurchaseRequest,
  orders: Pick<StockOrder, 'id' | 'itemId' | 'qty' | 'lines' | 'requestId'>[],
  items: Pick<ItemRecord, 'id' | 'name'>[],
) {
  const remain = row.lines
    .map((line) => {
      const name = items.find((item) => item.id === line.itemId)?.name ?? line.itemId
      return `${name} 잔량 ${requestRemainingQty(row, orders, line.itemId)}`
    })
    .join(', ')
  return `${row.id} · ${row.requesterName} · ${remain}`
}

export function requestSavedNotice(duplicate: boolean) {
  if (duplicate) return '같은 구매요청은 한 번만 반영됩니다.'
  return '구매요청을 저장했습니다. 바로 발주에 연결할 수 있습니다.'
}

export function requestListButtonLabel(
  row: PurchaseRequest,
  items: Pick<ItemRecord, 'id' | 'name'>[],
) {
  return `${row.id} · ${requestCaption(row, items)}`
}

export async function loadPurchaseRequests(db: Pick<CompanySqlite, 'query'>): Promise<PurchaseRequest[]> {
  const [rows, lineRows] = await Promise.all([
    db.query<RequestRow>(
      `select id, requester_name, department_id, department_name, needed_at, purpose, status, created_at
        from purchase_requests order by created_at desc, id`,
    ),
    db.query<RequestLineRow>(
      'select request_id, item_id, qty, unit_price from purchase_request_lines order by request_id, item_id',
    ),
  ])
  const linesByRequest = new Map<string, PurchaseRequestLine[]>()
  for (const row of lineRows) {
    const list = linesByRequest.get(row.request_id) ?? []
    list.push({
      itemId: row.item_id,
      qty: row.qty,
      ...(row.unit_price != null ? { unitPrice: row.unit_price } : {}),
    })
    linesByRequest.set(row.request_id, list)
  }
  return rows.map((row) => ({
    id: row.id,
    requesterName: row.requester_name,
    departmentId: row.department_id ?? undefined,
    departmentName: row.department_name ?? undefined,
    neededAt: row.needed_at ?? undefined,
    purpose: row.purpose ?? undefined,
    status: 'open',
    lines: linesByRequest.get(row.id) ?? [],
    createdAt: row.created_at ?? undefined,
  }))
}

export async function executePurchaseRequest(
  db: RequestDb,
  command: { operationId: string } & PurchaseRequestInput,
  createdAt = new Date().toISOString(),
  options?: { newItems?: ItemRecord[] },
): Promise<{ status: ProcessResult; request: PurchaseRequest }> {
  const existingOps = await db.query<{ operation_id: string }>(
    'select operation_id from processed_operations where operation_id = ?',
    [command.operationId],
  )
  const request = applyPurchaseRequest(command)
  if (existingOps.length) return { status: 'duplicate', request }
  const existing = await loadPurchaseRequests(db)
  if (existing.some((row) => row.id === request.id)) {
    throw new Error('같은 요청 번호가 있습니다.')
  }
  const createdItems = options?.newItems ?? []
  const statements: SqlStatement[] = [
    ...createdItems.map((item) => supplyItemInsert(item, createdAt)),
    {
      sql: 'insert into processed_operations(operation_id, result_json, created_at) values(?, ?, ?)',
      params: [command.operationId, JSON.stringify({ type: 'purchase_request' }), createdAt],
    },
    {
      sql: `insert into purchase_requests(
          id, requester_name, department_id, department_name, needed_at, purpose, status, operation_id, created_at
        ) values(?, ?, ?, ?, ?, ?, 'open', ?, ?)`,
      params: [
        request.id,
        request.requesterName,
        request.departmentId ?? null,
        request.departmentName ?? null,
        request.neededAt ?? null,
        request.purpose ?? null,
        command.operationId,
        createdAt,
      ],
    },
    ...request.lines.map((line) => ({
      sql: 'insert into purchase_request_lines(request_id, item_id, qty, unit_price) values(?, ?, ?, ?)',
      params: [request.id, line.itemId, line.qty, line.unitPrice ?? null],
    })),
    {
      sql: 'insert into audit_events(id, action, detail_json, created_at) values(?, ?, ?, ?)',
      params: [
        `${command.operationId}:audit`,
        'purchase_request',
        JSON.stringify({ operationId: command.operationId, requestId: request.id }),
        createdAt,
      ],
    },
  ]
  try {
    await db.batch(statements)
    return { status: 'applied', request }
  } catch (error) {
    if (isUniqueConstraintError(error)) return { status: 'duplicate', request }
    throw error
  }
}
