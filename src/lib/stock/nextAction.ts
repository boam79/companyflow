import { companyOnHand, orderRemaining, type LedgerLine, type StockCommand, type StockState } from './engine'

export type NextStockForm = {
  action: StockCommand['type']
  qty: string
  sourceOperationId?: string
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

export function suggestNextStockForm(state: StockState, orderId: string): NextStockForm | null {
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
      hint: `발주 잔량 ${remaining} 중 ${qty}을 수령하면 수불부에 입고로 이어집니다.`,
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

  return null
}
