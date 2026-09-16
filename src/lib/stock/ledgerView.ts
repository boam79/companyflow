import type { LedgerLine, LedgerTxnType, StockState } from './engine'

export type LedgerFilter = 'all' | 'in' | 'out'

export const TXN_LABELS: Record<LedgerTxnType, string> = {
  receipt: '수령 입고',
  direct_in: '직접 입고',
  issue: '반출',
  outbound: '출고',
  return: '반납 입고',
  transfer_out: '이동 출고',
  transfer_in: '이동 입고',
  adjust: '실사 조정',
  reversal: '정정',
}

export type LedgerViewRow = {
  line: LedgerLine
  label: string
  inbound: number | null
  outbound: number | null
  warehouseBalance: number
  companyBalance: number
  link: string
}

export function isInbound(line: LedgerLine): boolean {
  return line.qtyDelta > 0
}

export function relatedKeys(line: LedgerLine): string[] {
  return [line.operationId, line.sourceOperationId, line.orderId].filter(
    (value): value is string => Boolean(value),
  )
}

export function rowsAreRelated(a: LedgerLine, b: LedgerLine): boolean {
  const keys = new Set(relatedKeys(a))
  return relatedKeys(b).some((key) => keys.has(key))
}

export function formatLedgerLink(line: LedgerLine): string {
  const parts: string[] = []
  if (line.orderId) parts.push(`발주 ${line.orderId}`)
  if (line.sourceOperationId) parts.push(`원거래 ${line.sourceOperationId.slice(0, 8)}`)
  if (line.personName) parts.push(line.personName)
  if (line.departmentId) parts.push(line.departmentId)
  if (line.reason) parts.push(line.reason)
  return parts.join(' · ')
}

export function buildLedgerView(state: StockState): LedgerViewRow[] {
  const warehouse = new Map<string, number>()
  const company = new Map<string, number>()
  return state.ledger.map((line) => {
    const warehouseKey = `${line.itemId}:${line.warehouseId}`
    warehouse.set(warehouseKey, (warehouse.get(warehouseKey) ?? 0) + line.qtyDelta)
    company.set(line.itemId, (company.get(line.itemId) ?? 0) + line.qtyDelta)
    return {
      line,
      label: TXN_LABELS[line.txnType],
      inbound: line.qtyDelta > 0 ? line.qtyDelta : null,
      outbound: line.qtyDelta < 0 ? -line.qtyDelta : null,
      warehouseBalance: warehouse.get(warehouseKey) ?? 0,
      companyBalance: company.get(line.itemId) ?? 0,
      link: formatLedgerLink(line),
    }
  })
}

export function filterLedgerView(rows: LedgerViewRow[], filter: LedgerFilter): LedgerViewRow[] {
  if (filter === 'in') return rows.filter((row) => row.inbound != null)
  if (filter === 'out') return rows.filter((row) => row.outbound != null)
  return rows
}
