import type { ProcessResult } from '../idempotency'
import { assertStockOverflow, defaultStockPolicy, type StockPolicy } from './policy'

export type StockCommand =
  | {
      type: 'draft_order' | 'confirm_order'
      operationId: string
      orderId: string
      itemId: string
      qty: number
      partnerId?: string
      dueDate?: string
      orderDate?: string
      fileName?: string
      fileMime?: string
      fileBase64?: string
      currency?: string
      requestId?: string
      lines?: StockOrderLine[]
    }
  | {
      type: 'post_receipt'
      operationId: string
      orderId: string
      itemId: string
      warehouseId: string
      qty: number
      directAsset?: boolean
      defectQty?: number
      reason?: string
    }
  | {
      type: 'post_direct_in'
      operationId: string
      itemId: string
      warehouseId: string
      qty: number
      partnerId?: string
      purpose?: string
      businessDate?: string
      memo?: string
      fileName?: string
      fileMime?: string
      fileBase64?: string
    }
  | {
      type: 'post_issue'
      operationId: string
      itemId: string
      warehouseId: string
      qty: number
      personName?: string
      departmentId?: string
      reason?: string
      purpose?: string
      dueReturnAt?: string
      fileName?: string
      fileMime?: string
      fileBase64?: string
    }
  | {
      type: 'post_outbound'
      operationId: string
      itemId: string
      warehouseId: string
      qty: number
      reason?: string
    }
  | {
      type: 'post_return'
      operationId: string
      itemId: string
      warehouseId: string
      qty: number
      sourceOperationId: string
    }
  | {
      type: 'post_supplier_return'
      operationId: string
      orderId?: string
      sourceOperationId?: string
      itemId: string
      warehouseId: string
      qty: number
      reason?: string
    }
  | {
      type: 'transfer_stock'
      operationId: string
      itemId: string
      fromWarehouseId: string
      toWarehouseId: string
      qty: number
      reason?: string
    }
  | {
      type: 'adjust_stock'
      operationId: string
      itemId: string
      warehouseId: string
      countedQty: number
      reason: string
    }
  | {
      type: 'convert_to_asset'
      operationId: string
      itemId: string
      warehouseId: string
      qty: number
      reason?: string
    }
  | {
      type: 'reverse_transaction'
      operationId: string
      sourceOperationId: string
    }

export type LedgerTxnType =
  | 'receipt'
  | 'direct_in'
  | 'issue'
  | 'outbound'
  | 'return'
  | 'transfer_out'
  | 'transfer_in'
  | 'adjust'
  | 'reversal'
  | 'convert_out'
  | 'reject'
  | 'supplier_return'

export type LedgerLine = {
  id: string
  operationId: string
  txnType: LedgerTxnType
  itemId: string
  warehouseId: string
  qtyDelta: number
  personName?: string
  departmentId?: string
  sourceOperationId?: string
  orderId?: string
  reason?: string
  partnerId?: string
  purpose?: string
  dueReturnAt?: string
  businessDate?: string
  memo?: string
  fileName?: string
  fileMime?: string
  fileBase64?: string
  createdAt?: string
}

export function ledgerNoteFields(input: {
  memo?: string
  fileName?: string
  fileMime?: string
  fileBase64?: string
}): Pick<LedgerLine, 'memo' | 'fileName' | 'fileMime' | 'fileBase64'> {
  const fileName = input.fileName?.trim() || undefined
  const fileBase64 = input.fileBase64?.trim() || undefined
  if (fileBase64 && !fileName) throw new Error('첨부 이름이 필요합니다.')
  return {
    ...(input.memo?.trim() ? { memo: input.memo.trim() } : {}),
    ...(fileName ? { fileName, fileMime: input.fileMime?.trim() || undefined, fileBase64 } : {}),
  }
}

export type StockOrderLine = {
  itemId: string
  qty: number
}

export type StockOrder = {
  id: string
  itemId: string
  qty: number
  lines?: StockOrderLine[]
  status: 'draft' | 'confirmed'
  partnerId?: string
  dueDate?: string
  orderDate?: string
  fileName?: string
  fileMime?: string
  fileBase64?: string
  currency?: string
  requestId?: string
}

export type StockState = {
  processed: Map<string, ProcessResult>
  orders: Map<string, StockOrder>
  ledger: LedgerLine[]
}

export function createStockState(): StockState {
  return {
    processed: new Map(),
    orders: new Map(),
    ledger: [],
  }
}

export function countsTowardOnHand(line: Pick<LedgerLine, 'txnType'>): boolean {
  return line.txnType !== 'reject'
}

export function onHand(state: StockState, itemId: string, warehouseId: string): number {
  return state.ledger
    .filter((line) => line.itemId === itemId && line.warehouseId === warehouseId && countsTowardOnHand(line))
    .reduce((sum, line) => sum + line.qtyDelta, 0)
}

export function companyOnHand(state: StockState, itemId: string): number {
  return state.ledger
    .filter((line) => line.itemId === itemId && countsTowardOnHand(line))
    .reduce((sum, line) => sum + line.qtyDelta, 0)
}

export function returnBalance(ledger: LedgerLine[], sourceOperationId?: string) {
  const source = sourceOperationId?.trim() ?? ''
  if (!source) return { issued: 0, already: 0, left: 0 }
  const issued = ledger
    .filter((line) => line.operationId === source && line.txnType === 'issue')
    .reduce((sum, line) => sum + Math.abs(line.qtyDelta), 0)
  const already = ledger
    .filter((line) => line.sourceOperationId === source && line.txnType === 'return')
    .reduce((sum, line) => sum + line.qtyDelta, 0)
  return { issued, already, left: Math.max(0, issued - already) }
}

export function inboundLine(ledger: LedgerLine[], sourceOperationId?: string, itemId?: string) {
  const source = sourceOperationId?.trim() ?? ''
  if (!source) return undefined
  return ledger.find(
    (line) =>
      line.operationId === source &&
      line.txnType === 'direct_in' &&
      (!itemId || line.itemId === itemId),
  )
}

export function inboundSupplierSource(
  ledger: LedgerLine[],
  sourceOperationId?: string,
  itemId?: string,
  selected?: LedgerLine | null,
) {
  if (selected?.txnType === 'direct_in' && (!itemId || selected.itemId === itemId)) return selected
  return inboundLine(ledger, sourceOperationId, itemId)
}

export function inboundReturnBalance(ledger: LedgerLine[], sourceOperationId?: string, itemId?: string) {
  const source = inboundLine(ledger, sourceOperationId, itemId)
  if (!source) return { inbound: 0, already: 0, left: 0 }
  const inbound = Math.abs(source.qtyDelta)
  const already = ledger
    .filter(
      (line) =>
        line.sourceOperationId === source.operationId &&
        line.txnType === 'supplier_return' &&
        (!itemId || line.itemId === itemId),
    )
    .reduce((sum, line) => sum + Math.abs(line.qtyDelta), 0)
  return { inbound, already, left: Math.max(0, inbound - already) }
}

function requirePositive(qty: number) {
  if (!(qty > 0)) throw new Error('수량은 0보다 커야 합니다.')
}

export function stockOrderLines(order: Pick<StockOrder, 'itemId' | 'qty' | 'lines'>): StockOrderLine[] {
  return order.lines?.length ? order.lines : [{ itemId: order.itemId, qty: order.qty }]
}

export function resolveOrderLines(
  command: { itemId: string; qty: number; lines?: StockOrderLine[] },
  existing?: StockOrder,
): StockOrderLine[] {
  const raw = command.lines?.length
    ? command.lines
    : existing?.lines?.length && command.itemId === existing.itemId && command.qty === existing.qty
      ? existing.lines
      : [{ itemId: command.itemId, qty: command.qty }]
  if (!raw.length) throw new Error('발주 품목을 입력하세요.')
  const seen = new Set<string>()
  const lines: StockOrderLine[] = []
  for (const line of raw) {
    requirePositive(line.qty)
    if (!line.itemId) throw new Error('발주 품목을 입력하세요.')
    if (seen.has(line.itemId)) throw new Error('같은 품목은 한 줄로 모으세요.')
    seen.add(line.itemId)
    lines.push({ itemId: line.itemId, qty: line.qty })
  }
  return lines
}

export function orderReceived(state: StockState, orderId: string, itemId?: string): number {
  return state.ledger
    .filter(
      (line) =>
        line.orderId === orderId &&
        (line.txnType === 'receipt' || line.txnType === 'direct_in') &&
        (!itemId || line.itemId === itemId),
    )
    .reduce((sum, line) => sum + line.qtyDelta, 0)
}

export function orderRejected(state: StockState, orderId: string, itemId?: string): number {
  return state.ledger
    .filter(
      (line) =>
        line.orderId === orderId &&
        line.txnType === 'reject' &&
        (!itemId || line.itemId === itemId),
    )
    .reduce((sum, line) => sum + line.qtyDelta, 0)
}

export function orderSupplierReturned(state: StockState, orderId: string, itemId?: string): number {
  return state.ledger
    .filter(
      (line) =>
        line.orderId === orderId &&
        line.txnType === 'supplier_return' &&
        (!itemId || line.itemId === itemId),
    )
    .reduce((sum, line) => sum + Math.abs(line.qtyDelta), 0)
}

export function orderNetReceived(state: StockState, orderId: string, itemId?: string): number {
  return Math.max(0, orderReceived(state, orderId, itemId) - orderSupplierReturned(state, orderId, itemId))
}

export function orderRemaining(state: StockState, orderId: string, itemId?: string): number {
  const order = state.orders.get(orderId)
  if (!order || order.status !== 'confirmed') return 0
  const lines = stockOrderLines(order)
  if (itemId) {
    const line = lines.find((row) => row.itemId === itemId)
    if (!line) return 0
    return Math.max(0, line.qty - orderNetReceived(state, orderId, itemId))
  }
  return lines.reduce((sum, line) => sum + Math.max(0, line.qty - orderNetReceived(state, orderId, line.itemId)), 0)
}

export function applyStockCommand(
  state: StockState,
  command: StockCommand,
  policy: StockPolicy = defaultStockPolicy(),
): { status: ProcessResult; state: StockState } {
  if (state.processed.has(command.operationId)) {
    return { status: 'duplicate', state }
  }

  const next: StockState = {
    processed: new Map(state.processed),
    orders: new Map(state.orders),
    ledger: [...state.ledger],
  }

  switch (command.type) {
    case 'draft_order':
    case 'confirm_order': {
      const existing = next.orders.get(command.orderId)
      const lines = resolveOrderLines(command, existing)
      next.orders.set(command.orderId, {
        id: command.orderId,
        itemId: lines[0].itemId,
        qty: lines[0].qty,
        lines,
        status: command.type === 'draft_order' ? 'draft' : 'confirmed',
        partnerId: command.partnerId ?? existing?.partnerId,
        dueDate: command.dueDate ?? existing?.dueDate,
        orderDate: command.orderDate ?? existing?.orderDate,
        fileName: command.fileName ?? existing?.fileName,
        fileMime: command.fileMime ?? existing?.fileMime,
        fileBase64: command.fileBase64 ?? existing?.fileBase64,
        currency: command.currency ?? existing?.currency ?? 'KRW',
        requestId: command.requestId !== undefined ? command.requestId || undefined : existing?.requestId,
      })
      break
    }
    case 'post_receipt': {
      requirePositive(command.qty)
      const defectQty = command.defectQty ?? 0
      if (defectQty < 0) throw new Error('불량 수량은 0 이상이어야 합니다.')
      const order = next.orders.get(command.orderId)
      if (!order || order.status !== 'confirmed') {
        throw new Error('확정된 발주만 수령할 수 있습니다.')
      }
      const line = stockOrderLines(order).find((row) => row.itemId === command.itemId)
      if (!line) throw new Error('발주 품목이 다릅니다.')
      const remaining = line.qty - orderReceived(next, command.orderId, command.itemId)
      assertStockOverflow({
        over: command.qty > remaining,
        allowed: policy.allowOverReceipt,
        reason: command.reason,
        blocked: '발주 잔량을 초과해 수령할 수 없습니다.',
      })
      next.ledger.push({
        id: `${command.operationId}:receipt`,
        operationId: command.operationId,
        txnType: 'receipt',
        itemId: command.itemId,
        warehouseId: command.warehouseId,
        qtyDelta: command.qty,
        orderId: command.orderId,
        reason: command.reason?.trim() || (command.directAsset ? '직접 자산화' : undefined),
      })
      if (defectQty > 0) {
        next.ledger.push({
          id: `${command.operationId}:reject`,
          operationId: command.operationId,
          txnType: 'reject',
          itemId: command.itemId,
          warehouseId: command.warehouseId,
          qtyDelta: defectQty,
          orderId: command.orderId,
        })
      }
      if (command.directAsset) {
        next.ledger.push({
          id: `${command.operationId}:convert`,
          operationId: command.operationId,
          txnType: 'convert_out',
          itemId: command.itemId,
          warehouseId: command.warehouseId,
          qtyDelta: -command.qty,
          orderId: command.orderId,
          sourceOperationId: command.operationId,
          reason: '직접 자산화',
        })
      }
      break
    }
    case 'post_direct_in':
      requirePositive(command.qty)
      next.ledger.push({
        id: `${command.operationId}:direct`,
        operationId: command.operationId,
        txnType: 'direct_in',
        itemId: command.itemId,
        warehouseId: command.warehouseId,
        qtyDelta: command.qty,
        partnerId: command.partnerId?.trim() || undefined,
        purpose: command.purpose?.trim() || undefined,
        businessDate: command.businessDate?.trim() || undefined,
        ...ledgerNoteFields(command),
      })
      break
    case 'post_issue': {
      requirePositive(command.qty)
      if (!command.personName?.trim() && !command.departmentId?.trim()) {
        throw new Error('반출은 성명 또는 부서가 필요합니다.')
      }
      assertStockOverflow({
        over: command.qty > onHand(next, command.itemId, command.warehouseId),
        allowed: policy.allowNegative,
        reason: command.reason,
        blocked: '현재고를 초과해 반출할 수 없습니다.',
      })
      next.ledger.push({
        id: `${command.operationId}:issue`,
        operationId: command.operationId,
        txnType: 'issue',
        itemId: command.itemId,
        warehouseId: command.warehouseId,
        qtyDelta: -command.qty,
        personName: command.personName,
        departmentId: command.departmentId,
        reason: command.reason?.trim() || undefined,
        purpose: command.purpose?.trim() || undefined,
        dueReturnAt: command.dueReturnAt?.trim() || undefined,
        ...ledgerNoteFields(command),
      })
      break
    }
    case 'post_outbound': {
      requirePositive(command.qty)
      assertStockOverflow({
        over: command.qty > onHand(next, command.itemId, command.warehouseId),
        allowed: policy.allowNegative,
        reason: command.reason,
        blocked: '현재고를 초과해 출고할 수 없습니다.',
      })
      next.ledger.push({
        id: `${command.operationId}:outbound`,
        operationId: command.operationId,
        txnType: 'outbound',
        itemId: command.itemId,
        warehouseId: command.warehouseId,
        qtyDelta: -command.qty,
        reason: command.reason?.trim() || undefined,
      })
      break
    }
    case 'post_return': {
      requirePositive(command.qty)
      const { left } = returnBalance(next.ledger, command.sourceOperationId)
      if (command.qty > left) throw new Error('반출 수량을 초과해 반납할 수 없습니다.')
      next.ledger.push({
        id: `${command.operationId}:return`,
        operationId: command.operationId,
        txnType: 'return',
        itemId: command.itemId,
        warehouseId: command.warehouseId,
        qtyDelta: command.qty,
        sourceOperationId: command.sourceOperationId,
      })
      break
    }
    case 'post_supplier_return': {
      requirePositive(command.qty)
      const inbound = inboundLine(next.ledger, command.sourceOperationId, command.itemId)
      if (inbound) {
        const { left } = inboundReturnBalance(next.ledger, inbound.operationId, command.itemId)
        if (command.qty > left) throw new Error('원입고 수량을 초과해 반품할 수 없습니다.')
        assertStockOverflow({
          over: command.qty > onHand(next, command.itemId, command.warehouseId),
          allowed: policy.allowNegative,
          reason: command.reason,
          blocked: '현재고를 초과해 반품할 수 없습니다.',
        })
        next.ledger.push({
          id: `${command.operationId}:supplier-return`,
          operationId: command.operationId,
          txnType: 'supplier_return',
          itemId: command.itemId,
          warehouseId: command.warehouseId,
          qtyDelta: -command.qty,
          sourceOperationId: inbound.operationId,
          partnerId: inbound.partnerId,
          reason: command.reason?.trim() || undefined,
        })
        break
      }
      const orderId = command.orderId?.trim() ?? ''
      if (!orderId) throw new Error('수불부에서 입고 줄을 고르거나 발주를 넣으세요.')
      const order = next.orders.get(orderId)
      if (!order || order.status !== 'confirmed') {
        throw new Error('확정된 발주만 반품할 수 있습니다.')
      }
      if (!stockOrderLines(order).some((line) => line.itemId === command.itemId)) {
        throw new Error('발주 품목이 다릅니다.')
      }
      const net = orderNetReceived(next, orderId, command.itemId)
      if (command.qty > net) throw new Error('검수 통과 수량을 초과해 반품할 수 없습니다.')
      assertStockOverflow({
        over: command.qty > onHand(next, command.itemId, command.warehouseId),
        allowed: policy.allowNegative,
        reason: command.reason,
        blocked: '현재고를 초과해 반품할 수 없습니다.',
      })
      next.ledger.push({
        id: `${command.operationId}:supplier-return`,
        operationId: command.operationId,
        txnType: 'supplier_return',
        itemId: command.itemId,
        warehouseId: command.warehouseId,
        qtyDelta: -command.qty,
        orderId,
        reason: command.reason?.trim() || undefined,
      })
      break
    }
    case 'transfer_stock': {
      requirePositive(command.qty)
      if (command.fromWarehouseId === command.toWarehouseId) {
        throw new Error('같은 창고로는 이동할 수 없습니다.')
      }
      assertStockOverflow({
        over: command.qty > onHand(next, command.itemId, command.fromWarehouseId),
        allowed: policy.allowNegative,
        reason: command.reason,
        blocked: '현재고를 초과해 이동할 수 없습니다.',
      })
      next.ledger.push(
        {
          id: `${command.operationId}:out`,
          operationId: command.operationId,
          txnType: 'transfer_out',
          itemId: command.itemId,
          warehouseId: command.fromWarehouseId,
          qtyDelta: -command.qty,
          reason: command.reason?.trim() || undefined,
        },
        {
          id: `${command.operationId}:in`,
          operationId: command.operationId,
          txnType: 'transfer_in',
          itemId: command.itemId,
          warehouseId: command.toWarehouseId,
          qtyDelta: command.qty,
          reason: command.reason?.trim() || undefined,
        },
      )
      break
    }
    case 'adjust_stock': {
      if (!command.reason.trim()) throw new Error('실사 조정에는 사유가 필요합니다.')
      if (command.countedQty < 0) throw new Error('실사 수량은 0 이상이어야 합니다.')
      const delta = command.countedQty - onHand(next, command.itemId, command.warehouseId)
      if (delta !== 0) {
        next.ledger.push({
          id: `${command.operationId}:adjust`,
          operationId: command.operationId,
          txnType: 'adjust',
          itemId: command.itemId,
          warehouseId: command.warehouseId,
          qtyDelta: delta,
          reason: command.reason.trim(),
        })
      }
      break
    }
    case 'convert_to_asset': {
      requirePositive(command.qty)
      assertStockOverflow({
        over: command.qty > onHand(next, command.itemId, command.warehouseId),
        allowed: policy.allowNegative,
        reason: command.reason,
        blocked: '현재고를 초과해 자산화할 수 없습니다.',
      })
      next.ledger.push({
        id: `${command.operationId}:convert`,
        operationId: command.operationId,
        txnType: 'convert_out',
        itemId: command.itemId,
        warehouseId: command.warehouseId,
        qtyDelta: -command.qty,
        reason: command.reason?.trim() || '재고 자산화',
      })
      break
    }
    case 'reverse_transaction': {
      const original = next.ledger.filter((line) => line.operationId === command.sourceOperationId)
      if (!original.length) throw new Error('정정할 원거래를 찾을 수 없습니다.')
      if (original.some((line) => line.txnType === 'reversal')) {
        throw new Error('정정 거래를 다시 정정하지 않습니다. 새 반대 거래를 등록하세요.')
      }
      const already = next.ledger.some(
        (line) => line.sourceOperationId === command.sourceOperationId && line.txnType === 'reversal',
      )
      if (already) throw new Error('이미 정정된 거래입니다.')
      for (const line of original) {
        next.ledger.push({
          id: `${command.operationId}:${line.id}`,
          operationId: command.operationId,
          txnType: 'reversal',
          itemId: line.itemId,
          warehouseId: line.warehouseId,
          qtyDelta: -line.qtyDelta,
          sourceOperationId: command.sourceOperationId,
        })
      }
      break
    }
    default:
      throw new Error('알 수 없는 재고 명령입니다.')
  }

  next.processed.set(command.operationId, 'applied')
  return { status: 'applied', state: next }
}

export const STOCK_TABLE_SQL = [
  `create table if not exists stock_orders (
    id text primary key,
    item_id text not null,
    qty integer not null,
    status text not null,
    partner_id text,
    due_date text,
    order_date text,
    file_name text,
    file_mime text,
    file_base64 text,
    currency text not null default 'KRW',
    request_id text,
    operation_id text not null unique,
    created_at text not null
  );`,
  `create table if not exists stock_order_lines (
    order_id text not null,
    item_id text not null,
    qty integer not null,
    primary key (order_id, item_id)
  );`,
  `create table if not exists stock_ledger (
    id text primary key,
    operation_id text not null,
    txn_type text not null,
    item_id text not null,
    warehouse_id text not null,
    qty_delta integer not null,
    person_name text,
    department_id text,
    source_operation_id text,
    order_id text,
    reason text,
    created_at text not null
  );`,
]
