import type { ProcessResult } from '../idempotency'

export type StockCommand =
  | {
      type: 'draft_order' | 'confirm_order'
      operationId: string
      orderId: string
      itemId: string
      qty: number
      partnerId?: string
      dueDate?: string
    }
  | {
      type: 'post_receipt'
      operationId: string
      orderId: string
      itemId: string
      warehouseId: string
      qty: number
      directAsset?: boolean
    }
  | {
      type: 'post_direct_in'
      operationId: string
      itemId: string
      warehouseId: string
      qty: number
    }
  | {
      type: 'post_issue'
      operationId: string
      itemId: string
      warehouseId: string
      qty: number
      personName?: string
      departmentId?: string
    }
  | {
      type: 'post_outbound'
      operationId: string
      itemId: string
      warehouseId: string
      qty: number
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
      type: 'transfer_stock'
      operationId: string
      itemId: string
      fromWarehouseId: string
      toWarehouseId: string
      qty: number
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
  createdAt?: string
}

export type StockOrder = {
  id: string
  itemId: string
  qty: number
  status: 'draft' | 'confirmed'
  partnerId?: string
  dueDate?: string
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

export function onHand(state: StockState, itemId: string, warehouseId: string): number {
  return state.ledger
    .filter((line) => line.itemId === itemId && line.warehouseId === warehouseId)
    .reduce((sum, line) => sum + line.qtyDelta, 0)
}

export function companyOnHand(state: StockState, itemId: string): number {
  return state.ledger
    .filter((line) => line.itemId === itemId)
    .reduce((sum, line) => sum + line.qtyDelta, 0)
}

function requirePositive(qty: number) {
  if (!(qty > 0)) throw new Error('수량은 0보다 커야 합니다.')
}

export function orderReceived(state: StockState, orderId: string): number {
  return state.ledger
    .filter((line) => line.orderId === orderId && (line.txnType === 'receipt' || line.txnType === 'direct_in'))
    .reduce((sum, line) => sum + line.qtyDelta, 0)
}

export function orderRemaining(state: StockState, orderId: string): number {
  const order = state.orders.get(orderId)
  if (!order || order.status !== 'confirmed') return 0
  return Math.max(0, order.qty - orderReceived(state, orderId))
}

export function applyStockCommand(
  state: StockState,
  command: StockCommand,
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
      requirePositive(command.qty)
      const existing = next.orders.get(command.orderId)
      next.orders.set(command.orderId, {
        id: command.orderId,
        itemId: command.itemId,
        qty: command.qty,
        status: command.type === 'draft_order' ? 'draft' : 'confirmed',
        partnerId: command.partnerId ?? existing?.partnerId,
        dueDate: command.dueDate ?? existing?.dueDate,
      })
      break
    }
    case 'post_receipt': {
      requirePositive(command.qty)
      const order = next.orders.get(command.orderId)
      if (!order || order.status !== 'confirmed') {
        throw new Error('확정된 발주만 수령할 수 있습니다.')
      }
      if (order.itemId !== command.itemId) throw new Error('발주 품목이 다릅니다.')
      const remaining = order.qty - orderReceived(next, command.orderId)
      if (command.qty > remaining) throw new Error('발주 잔량을 초과해 수령할 수 없습니다.')
      next.ledger.push({
        id: `${command.operationId}:receipt`,
        operationId: command.operationId,
        txnType: 'receipt',
        itemId: command.itemId,
        warehouseId: command.warehouseId,
        qtyDelta: command.qty,
        orderId: command.orderId,
        reason: command.directAsset ? '직접 자산화' : undefined,
      })
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
      })
      break
    case 'post_issue': {
      requirePositive(command.qty)
      if (!command.personName?.trim() && !command.departmentId?.trim()) {
        throw new Error('반출은 성명 또는 부서가 필요합니다.')
      }
      if (command.qty > onHand(next, command.itemId, command.warehouseId)) {
        throw new Error('현재고를 초과해 반출할 수 없습니다.')
      }
      next.ledger.push({
        id: `${command.operationId}:issue`,
        operationId: command.operationId,
        txnType: 'issue',
        itemId: command.itemId,
        warehouseId: command.warehouseId,
        qtyDelta: -command.qty,
        personName: command.personName,
        departmentId: command.departmentId,
      })
      break
    }
    case 'post_outbound': {
      requirePositive(command.qty)
      if (command.qty > onHand(next, command.itemId, command.warehouseId)) {
        throw new Error('현재고를 초과해 출고할 수 없습니다.')
      }
      next.ledger.push({
        id: `${command.operationId}:outbound`,
        operationId: command.operationId,
        txnType: 'outbound',
        itemId: command.itemId,
        warehouseId: command.warehouseId,
        qtyDelta: -command.qty,
      })
      break
    }
    case 'post_return': {
      requirePositive(command.qty)
      const issued = next.ledger
        .filter((line) => line.operationId === command.sourceOperationId && line.txnType === 'issue')
        .reduce((sum, line) => sum + Math.abs(line.qtyDelta), 0)
      const already = next.ledger
        .filter(
          (line) => line.sourceOperationId === command.sourceOperationId && line.txnType === 'return',
        )
        .reduce((sum, line) => sum + line.qtyDelta, 0)
      if (command.qty > issued - already) throw new Error('반출 수량을 초과해 반납할 수 없습니다.')
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
    case 'transfer_stock': {
      requirePositive(command.qty)
      if (command.fromWarehouseId === command.toWarehouseId) {
        throw new Error('같은 창고로는 이동할 수 없습니다.')
      }
      if (command.qty > onHand(next, command.itemId, command.fromWarehouseId)) {
        throw new Error('현재고를 초과해 이동할 수 없습니다.')
      }
      next.ledger.push(
        {
          id: `${command.operationId}:out`,
          operationId: command.operationId,
          txnType: 'transfer_out',
          itemId: command.itemId,
          warehouseId: command.fromWarehouseId,
          qtyDelta: -command.qty,
        },
        {
          id: `${command.operationId}:in`,
          operationId: command.operationId,
          txnType: 'transfer_in',
          itemId: command.itemId,
          warehouseId: command.toWarehouseId,
          qtyDelta: command.qty,
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
      if (command.qty > onHand(next, command.itemId, command.warehouseId)) {
        throw new Error('현재고를 초과해 자산화할 수 없습니다.')
      }
      next.ledger.push({
        id: `${command.operationId}:convert`,
        operationId: command.operationId,
        txnType: 'convert_out',
        itemId: command.itemId,
        warehouseId: command.warehouseId,
        qtyDelta: -command.qty,
        reason: '재고 자산화',
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
    operation_id text not null unique,
    created_at text not null
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
