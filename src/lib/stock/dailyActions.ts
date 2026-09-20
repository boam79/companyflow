import type { StockCommand } from './engine'

export const DAILY_STOCK_ACTIONS: { id: StockCommand['type']; label: string }[] = [
  { id: 'post_direct_in', label: '입고' },
  { id: 'post_issue', label: '반출' },
  { id: 'post_return', label: '반납' },
]

export const MORE_STOCK_ACTIONS: { id: StockCommand['type']; label: string }[] = [
  { id: 'confirm_order', label: '발주 확정' },
  { id: 'post_receipt', label: '수령' },
  { id: 'post_supplier_return', label: '공급사 반품' },
  { id: 'draft_order', label: '발주 초안' },
  { id: 'post_outbound', label: '출고' },
  { id: 'adjust_stock', label: '실사 조정' },
  { id: 'reverse_transaction', label: '정정' },
]

export function stockActionChoices(showMore: boolean, current: StockCommand['type']) {
  if (showMore) return [...DAILY_STOCK_ACTIONS, ...MORE_STOCK_ACTIONS]
  if (MORE_STOCK_ACTIONS.some((row) => row.id === current)) {
    return [...DAILY_STOCK_ACTIONS, ...MORE_STOCK_ACTIONS.filter((row) => row.id === current)]
  }
  return DAILY_STOCK_ACTIONS
}
