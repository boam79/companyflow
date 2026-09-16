import type { AssetRecord } from '../asset/book'
import { isTransfer, TXN_LABELS } from '../stock/ledgerView'
import type { LedgerLine, StockState } from '../stock/engine'
import { companyOnHand } from '../stock/engine'

export type DateRange = { from: string; to: string }

export function businessDay(iso: string | undefined): string | null {
  if (!iso) return null
  const parsed = new Date(iso)
  if (!Number.isNaN(parsed.getTime()) && /T/.test(iso) && iso.length >= 16) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(parsed)
  }
  const day = iso.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null
}

export function inInclusiveRange(iso: string | undefined, range: DateRange): boolean {
  const day = businessDay(iso)
  if (!day) return true
  return day >= range.from && day <= range.to
}

export function linesInRange(ledger: LedgerLine[], itemId: string, range: DateRange): LedgerLine[] {
  return ledger.filter((line) => line.itemId === itemId && inInclusiveRange(line.createdAt, range))
}

export function sumTxn(
  ledger: LedgerLine[],
  txnType: LedgerLine['txnType'],
  range: DateRange,
  itemId?: string,
): number {
  return ledger
    .filter(
      (line) =>
        line.txnType === txnType &&
        inInclusiveRange(line.createdAt, range) &&
        (!itemId || line.itemId === itemId),
    )
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

export type ReportDetail = {
  day: string
  label: string
  qty: number
  direction: 'in' | 'out'
}

export function summarizeStock(
  state: StockState,
  assets: AssetRecord[],
  itemId: string,
  range: DateRange,
  item?: { assetManaged?: boolean },
): StockSummary {
  return {
    receipt:
      sumTxn(state.ledger, 'receipt', range, itemId) +
      sumTxn(state.ledger, 'direct_in', range, itemId) +
      sumTxn(state.ledger, 'return', range, itemId),
    issue: sumTxn(state.ledger, 'issue', range, itemId) + sumTxn(state.ledger, 'outbound', range, itemId),
    convert: sumTxn(state.ledger, 'convert_out', range, itemId),
    onHand: companyOnHand(state, itemId),
    assets: assets.filter((asset) => asset.itemId === itemId).length,
    assigned:
      item?.assetManaged === false
        ? 0
        : assets.filter((asset) => asset.itemId === itemId && asset.status === 'assigned').length,
  }
}

export function reportDetails(ledger: LedgerLine[], itemId: string, range: DateRange): ReportDetail[] {
  return linesInRange(ledger, itemId, range)
    .filter((line) => !isTransfer(line))
    .map((line) => ({
      day: businessDay(line.createdAt) ?? '-',
      label: TXN_LABELS[line.txnType],
      qty: Math.abs(line.qtyDelta),
      direction: line.qtyDelta > 0 ? 'in' : 'out',
    }))
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

export function csvFromReport(
  itemName: string,
  summary: StockSummary,
  range: DateRange,
  details: ReportDetail[],
): string {
  const detailLines = [
    '',
    '상세',
    '일자,구분,방향,수량',
    ...details.map((row) =>
      [row.day, row.label, row.direction === 'in' ? '입고' : '출고', String(row.qty)].join(','),
    ),
  ]
  return [csvFromSummary(itemName, summary, range), ...detailLines].join('\n')
}
