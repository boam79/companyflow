import type { ProcessResult } from '../idempotency'
import { formatCompanyMoney } from '../company/displayCurrency'
import { assertContractFile, base64ToBytes, bytesToBase64 } from '../contracts/book'
import type { ItemRecord } from '../master/book'
import { loadItems } from '../master/book'
import { purchaseKindLabel } from '../master/commands'
import type { CompanySqlite } from '../sqlite/client'
import { ledgerCatalogFields, stockOrderLines, type StockOrder, type StockOrderLine } from './engine'
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
  itemName?: string
  itemUnit?: string
  purchaseKind?: string
}

export type PurchaseRequest = {
  id: string
  requesterName: string
  departmentId?: string
  departmentName?: string
  neededAt?: string
  purpose?: string
  status: 'open'
  fileName?: string
  fileMime?: string
  fileBase64?: string
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
  fileName?: string
  fileMime?: string
  fileBase64?: string
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
  file_name?: string | null
  file_mime?: string | null
  created_at?: string | null
}

type RequestLineRow = {
  request_id: string
  item_id: string
  qty: number
  unit_price?: number | null
  item_name?: string | null
  item_unit?: string | null
  purchase_kind?: string | null
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
    file_name text,
    file_mime text,
    file_base64 text,
    operation_id text not null unique,
    created_at text not null
  );`,
  `create table if not exists purchase_request_lines (
    request_id text not null,
    item_id text not null,
    qty integer not null,
    unit_price integer,
    item_name text,
    item_unit text,
    purchase_kind text,
    primary key (request_id, item_id)
  );`,
]

export function requestAttachment(file: { name: string; mime?: string; bytes: Uint8Array }) {
  const fileMime = assertContractFile(file.bytes.byteLength, file.mime, file.name, file.bytes)
  return {
    fileName: file.name.trim() || '요청첨부',
    fileMime,
    fileBase64: bytesToBase64(file.bytes),
  }
}

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
      ...(line.itemName?.trim() ? { itemName: line.itemName.trim() } : {}),
      ...(line.itemUnit?.trim() ? { itemUnit: line.itemUnit.trim() } : {}),
      ...(line.purchaseKind?.trim() ? { purchaseKind: line.purchaseKind.trim() } : {}),
    })
  }
  if (!lines.length) throw new Error('요청 품목과 수량이 필요합니다.')
  const fileName = input.fileName?.trim() || undefined
  const fileBase64 = input.fileBase64?.trim() || undefined
  if (fileBase64 && !fileName) throw new Error('요청 첨부 이름이 필요합니다.')
  return {
    id,
    requesterName,
    departmentId: input.departmentId?.trim() || undefined,
    departmentName: input.departmentName?.trim() || undefined,
    neededAt: input.neededAt?.trim() || undefined,
    purpose: input.purpose?.trim() || undefined,
    status: 'open',
    fileName,
    fileMime: fileName ? input.fileMime?.trim() || undefined : undefined,
    fileBase64: fileName ? fileBase64 : undefined,
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
      const name = line.itemName || items.find((item) => item.id === line.itemId)?.name || line.itemId
      const label = [name, line.itemUnit, line.purchaseKind].filter(Boolean).join(' · ')
      return `${label} ${line.qty}`
    })
    .join(', ')
  const amount = requestAmountText(requestTotalAmount(row.lines))
  return [row.requesterName, row.departmentName, row.neededAt ? `필요 ${row.neededAt}` : '', row.purpose, itemPart, amount, row.fileName]
    .filter(Boolean)
    .join(' · ')
}

export function requestProgress(
  row: PurchaseRequest,
  orders: Pick<StockOrder, 'id' | 'itemId' | 'qty' | 'lines' | 'requestId'>[],
): '미발주' | '부분발주' | '발주완료' {
  const lines = row.lines
  if (!lines.length) return '미발주'
  const lefts = lines.map((line) => ({ qty: line.qty, left: requestRemainingQty(row, orders, line.itemId) }))
  if (lefts.every((line) => line.left <= 0)) return '발주완료'
  if (lefts.every((line) => line.left >= line.qty)) return '미발주'
  return '부분발주'
}

export function requestRemainCaption(
  row: PurchaseRequest,
  orders: Pick<StockOrder, 'id' | 'itemId' | 'qty' | 'lines' | 'requestId'>[],
  items: Pick<ItemRecord, 'id' | 'name'>[],
) {
  return row.lines
    .flatMap((line) => {
      const left = requestRemainingQty(row, orders, line.itemId)
      if (left <= 0) return []
      const name = line.itemName || items.find((item) => item.id === line.itemId)?.name || line.itemId
      const label = [name, line.itemUnit, line.purchaseKind].filter(Boolean).join(' · ')
      return [`${label} 미발주 ${left}`]
    })
    .join(', ')
}

export function requestSelectLabel(
  row: PurchaseRequest,
  orders: Pick<StockOrder, 'id' | 'itemId' | 'qty' | 'lines' | 'requestId'>[],
  items: Pick<ItemRecord, 'id' | 'name'>[],
) {
  const remain = requestRemainCaption(row, orders, items)
  return [row.id, row.requesterName, remain, requestProgress(row, orders)].filter(Boolean).join(' · ')
}

export function requestSavedNotice(duplicate: boolean) {
  if (duplicate) return '같은 구매요청은 한 번만 반영됩니다.'
  return '구매요청을 저장했습니다. 바로 발주에 연결할 수 있습니다.'
}

export function requestListButtonLabel(
  row: PurchaseRequest,
  orders: Pick<StockOrder, 'id' | 'itemId' | 'qty' | 'lines' | 'requestId'>[],
  items: Pick<ItemRecord, 'id' | 'name'>[],
) {
  return `${row.id} · ${requestCaption(row, items)} · ${requestProgress(row, orders)}`
}

export function overduePurchaseRequests(
  rows: PurchaseRequest[],
  orders: Pick<StockOrder, 'id' | 'itemId' | 'qty' | 'lines' | 'requestId'>[],
  today: string,
): PurchaseRequest[] {
  return rows
    .filter(
      (row) =>
        requestHasRemaining(row, orders) &&
        /^\d{4}-\d{2}-\d{2}$/.test(row.neededAt ?? '') &&
        (row.neededAt ?? '') < today,
    )
    .sort(
      (a, b) =>
        (a.neededAt ?? '').localeCompare(b.neededAt ?? '') || a.id.localeCompare(b.id),
    )
}

export function overduePurchaseRequestCaption(row: PurchaseRequest) {
  const itemPart = row.lines
    .map((line) => [line.itemName, line.itemUnit, line.purchaseKind].filter(Boolean).join(' · '))
    .filter(Boolean)
    .join(', ')
  return [
    row.id,
    row.neededAt ? `필요 ${row.neededAt}` : '',
    row.requesterName,
    row.departmentName,
    row.purpose,
    itemPart,
    row.fileName,
  ]
    .filter(Boolean)
    .join(' · ')
}

export async function loadPurchaseRequests(db: Pick<CompanySqlite, 'query'>): Promise<PurchaseRequest[]> {
  const [rows, lineRows] = await Promise.all([
    db.query<RequestRow>(
      `select id, requester_name, department_id, department_name, needed_at, purpose, status,
        file_name, file_mime, created_at
        from purchase_requests order by created_at desc, id`,
    ),
    db.query<RequestLineRow>(
      'select request_id, item_id, qty, unit_price, item_name, item_unit, purchase_kind from purchase_request_lines order by request_id, item_id',
    ),
  ])
  const linesByRequest = new Map<string, PurchaseRequestLine[]>()
  for (const row of lineRows) {
    const list = linesByRequest.get(row.request_id) ?? []
    list.push({
      itemId: row.item_id,
      qty: row.qty,
      ...(row.unit_price != null ? { unitPrice: row.unit_price } : {}),
      ...(row.item_name ? { itemName: row.item_name } : {}),
      ...(row.item_unit ? { itemUnit: row.item_unit } : {}),
      ...(row.purchase_kind ? { purchaseKind: row.purchase_kind } : {}),
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
    fileName: row.file_name ?? undefined,
    fileMime: row.file_mime ?? undefined,
    lines: linesByRequest.get(row.id) ?? [],
    createdAt: row.created_at ?? undefined,
  }))
}

export function stampRequestLines(
  lines: PurchaseRequestLine[],
  items: Pick<ItemRecord, 'id' | 'name' | 'unit' | 'purchaseKind'>[],
  kinds: { id: string; name: string }[] = [],
): PurchaseRequestLine[] {
  return lines.map((line) => {
    const item = items.find((row) => row.id === line.itemId)
    const kind = item ? purchaseKindLabel(item.purchaseKind, kinds) : undefined
    return {
      ...line,
      ...ledgerCatalogFields({
        itemName: line.itemName || item?.name,
        itemUnit: line.itemUnit || item?.unit || (item ? '개' : undefined),
        purchaseKind: line.purchaseKind || kind,
      }),
    }
  })
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
  const [itemRows, kinds] = await Promise.all([
    loadItems(db),
    db.query<{ id: string; name: string }>('select id, name from purchase_kinds'),
  ])
  const stamped: PurchaseRequest = {
    ...request,
    lines: stampRequestLines(
      request.lines,
      [...itemRows, ...createdItems.filter((item) => !itemRows.some((row) => row.id === item.id))],
      kinds,
    ),
  }
  const statements: SqlStatement[] = [
    ...createdItems.map((item) => supplyItemInsert(item, createdAt)),
    {
      sql: 'insert into processed_operations(operation_id, result_json, created_at) values(?, ?, ?)',
      params: [command.operationId, JSON.stringify({ type: 'purchase_request' }), createdAt],
    },
    {
      sql: `insert into purchase_requests(
          id, requester_name, department_id, department_name, needed_at, purpose, status,
          file_name, file_mime, file_base64, operation_id, created_at
        ) values(?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?)`,
      params: [
        stamped.id,
        stamped.requesterName,
        stamped.departmentId ?? null,
        stamped.departmentName ?? null,
        stamped.neededAt ?? null,
        stamped.purpose ?? null,
        stamped.fileName ?? null,
        stamped.fileMime ?? null,
        stamped.fileBase64 ?? null,
        command.operationId,
        createdAt,
      ],
    },
    ...stamped.lines.map((line) => ({
      sql: 'insert into purchase_request_lines(request_id, item_id, qty, unit_price, item_name, item_unit, purchase_kind) values(?, ?, ?, ?, ?, ?, ?)',
      params: [
        stamped.id,
        line.itemId,
        line.qty,
        line.unitPrice ?? null,
        line.itemName ?? null,
        line.itemUnit ?? null,
        line.purchaseKind ?? null,
      ],
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
    return { status: 'applied', request: stamped }
  } catch (error) {
    if (isUniqueConstraintError(error)) return { status: 'duplicate', request: stamped }
    throw error
  }
}

export async function loadRequestOriginal(
  db: Pick<CompanySqlite, 'query'>,
  requestId: string,
) {
  const rows = await db.query<{
    file_name?: string | null
    file_mime?: string | null
    file_base64?: string | null
  }>('select file_name, file_mime, file_base64 from purchase_requests where id = ?', [requestId])
  const row = rows[0]
  if (!row?.file_base64 || !row.file_name) throw new Error('요청 첨부가 없습니다.')
  return {
    fileName: row.file_name,
    fileMime: row.file_mime || 'application/octet-stream',
    bytes: base64ToBytes(row.file_base64),
  }
}
