import {
  applyStockCommand,
  companyOnHand,
  onHand,
  orderRemaining,
  type LedgerLine,
  type StockCommand,
  type StockState,
} from './engine'

export function objectMarker(qty: number): '을' | '를' {
  const last = Math.abs(qty) % 10
  return last === 2 || last === 4 || last === 5 || last === 9 ? '를' : '을'
}

export type NextStockForm = {
  action: StockCommand['type']
  qty: string
  sourceOperationId?: string
  warehouseId?: string
  hint: string
}

function returnedQty(state: StockState, operationId: string): number {
  return state.ledger
    .filter((line) => line.txnType === 'return' && line.sourceOperationId === operationId)
    .reduce((sum, line) => sum + line.qtyDelta, 0)
}

function lastOpenOutbound(state: StockState): LedgerLine | undefined {
  const outs = state.ledger.filter((line) => line.txnType === 'issue' || line.txnType === 'outbound')
  for (let index = outs.length - 1; index >= 0; index -= 1) {
    const line = outs[index]
    if (returnedQty(state, line.operationId) === 0) return line
  }
  return undefined
}

export function suggestNextStockForm(
  state: StockState,
  orderId: string,
  item?: { assetManaged?: boolean },
): NextStockForm | null {
  const order = state.orders.get(orderId)
  if (order?.status === 'draft') {
    return {
      action: 'confirm_order',
      qty: String(order.qty),
      hint: '발주를 확정하세요. 확정 전에는 현재고에 안 들어갑니다.',
    }
  }

  const remaining = orderRemaining(state, orderId)
  if (order?.status === 'confirmed' && remaining > 0) {
    const qty = remaining >= 10 ? 6 : remaining
    return {
      action: 'post_receipt',
      qty: String(qty),
      hint: `발주 잔량 ${remaining} 중 ${qty}${objectMarker(qty)} 수령하면 수불부에 입고로 이어집니다.`,
    }
  }

  const openOut = lastOpenOutbound(state)
  if (openOut) {
    return {
      action: 'post_return',
      qty: '1',
      sourceOperationId: openOut.operationId,
      hint: '반출에 이어 반납 1을 확정하면 입고로 돌아옵니다.',
    }
  }

  const itemId = order?.itemId ?? state.ledger.at(-1)?.itemId
  const moved = state.ledger.some((line) => line.txnType === 'transfer_out')
  if (!moved && itemId && companyOnHand(state, itemId) >= 2) {
    return {
      action: 'transfer_stock',
      qty: '2',
      hint: '본사에서 부속으로 2를 옮기면 회사 합계는 그대로입니다.',
    }
  }

  if (itemId && item?.assetManaged) {
    const warehouseId = ['wh-main', 'wh-sub'].find((id) => onHand(state, itemId, id) > 0)
    if (warehouseId) {
      return {
        action: 'convert_to_asset',
        qty: '1',
        warehouseId,
        hint: '자산관리 품목만 자산화합니다. 명찰·유니폼·노트북은 입퇴사 프로세스입니다.',
      }
    }
  }

  return null
}

export type SuggestionContext = {
  orderId: string
  itemId: string
  warehouseId: string
  fromWarehouseId: string
  toWarehouseId: string
}

export function commandFromSuggestion(
  suggestion: NextStockForm,
  operationId: string,
  ctx: SuggestionContext,
): StockCommand {
  const qty = Number(suggestion.qty)
  switch (suggestion.action) {
    case 'draft_order':
    case 'confirm_order':
      return {
        type: suggestion.action,
        operationId,
        orderId: ctx.orderId,
        itemId: ctx.itemId,
        qty,
      }
    case 'post_receipt':
      return {
        type: 'post_receipt',
        operationId,
        orderId: ctx.orderId,
        itemId: ctx.itemId,
        warehouseId: ctx.warehouseId,
        qty,
      }
    case 'post_return':
      if (!suggestion.sourceOperationId) throw new Error('반납할 원거래가 없습니다.')
      return {
        type: 'post_return',
        operationId,
        itemId: ctx.itemId,
        warehouseId: ctx.warehouseId,
        qty,
        sourceOperationId: suggestion.sourceOperationId,
      }
    case 'transfer_stock':
      return {
        type: 'transfer_stock',
        operationId,
        itemId: ctx.itemId,
        fromWarehouseId: ctx.fromWarehouseId,
        toWarehouseId: ctx.toWarehouseId,
        qty,
      }
    case 'convert_to_asset':
      return {
        type: 'convert_to_asset',
        operationId,
        itemId: ctx.itemId,
        warehouseId: suggestion.warehouseId ?? ctx.warehouseId,
        qty,
      }
    default:
      throw new Error('이어서 처리할 수 없는 거래입니다.')
  }
}

export function applySuggestionChain(
  state: StockState,
  ctx: SuggestionContext,
  nextOperationId: () => string,
  limit = 8,
): StockState {
  let current = state
  for (let step = 0; step < limit; step += 1) {
    const next = suggestNextStockForm(current, ctx.orderId)
    if (!next || next.action === 'convert_to_asset') return current
    const result = applyStockCommand(current, commandFromSuggestion(next, nextOperationId(), ctx))
    if (result.status !== 'applied') return current
    current = result.state
  }
  return current
}
