import type { AssetRecord } from '../asset/book'
import type { LedgerLine, StockState } from '../stock/engine'
import { companyOnHand } from '../stock/engine'

export type DateRange = { from: string; to: string }

export function inInclusiveRange(iso: string | undefined, range: DateRange): boolean {
  const day = (iso ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return true
  return day >= range.from && day <= range.to
}

export function sumTxn(ledger: LedgerLine[], txnType: LedgerLine['txnType'], range: DateRange): number {
  return ledger
    .filter((line) => line.txnType === txnType && inInclusiveRange(line.createdAt, range))
    .reduce((sum, line) => sum + Math.abs(line.qtyDelta), 0)
}

export type StockSummary = {
  receipt: number
  issue: number
  convert: number
  onHand: number
  assets: number
  assigned: number
}

export function summarizeStock(
  state: StockState,
  assets: AssetRecord[],
  itemId: string,
  range: DateRange,
): StockSummary {
  return {
    receipt:
      sumTxn(state.ledger, 'receipt', range) +
      sumTxn(state.ledger, 'direct_in', range) +
      sumTxn(state.ledger, 'return', range),
    issue: sumTxn(state.ledger, 'issue', range) + sumTxn(state.ledger, 'outbound', range),
    convert: sumTxn(state.ledger, 'convert_out', range),
    onHand: companyOnHand(state, itemId),
    assets: assets.filter((asset) => asset.itemId === itemId).length,
    assigned: assets.filter((asset) => asset.itemId === itemId && asset.status === 'assigned').length,
  }
}

export function csvFromSummary(itemName: string, summary: StockSummary, range: DateRange): string {
  const rows = [
    ['품목', '시작일', '종료일', '입고', '출고', '자산화', '현재고', '자산', '배정'],
    [
      itemName,
      range.from,
      range.to,
      String(summary.receipt),
      String(summary.issue),
      String(summary.convert),
      String(summary.onHand),
      String(summary.assets),
      String(summary.assigned),
    ],
  ]
  return rows.map((row) => row.join(',')).join('\n')
}
