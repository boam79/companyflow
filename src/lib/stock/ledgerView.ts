import { countsTowardOnHand, type LedgerLine, type LedgerTxnType, type StockState } from './engine'

export type LedgerFilter = 'all' | 'in' | 'out'

export const TXN_LABELS: Record<LedgerTxnType, string> = {
  receipt: '수령 입고',
  direct_in: '직접 입고',
  issue: '반출',
  outbound: '출고',
  return: '반납 입고',
  transfer_out: '이동 출고',
  transfer_in: '이동 입고',
  convert_out: '자산화 출고',
  adjust: '실사 조정',
  reversal: '정정',
  reject: '검수 불량',
  supplier_return: '공급사 반품',
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

export type LedgerNameMaps = {
  departments?: { id: string; name: string }[]
  warehouses?: { id: string; name: string }[]
}

export function formatLedgerLink(
  line: LedgerLine,
  names?: LedgerNameMaps,
  warehouseName?: string,
): string {
  const parts: string[] = []
  if (line.orderId) parts.push(`발주 ${line.orderId}`)
  if (line.sourceOperationId) parts.push(`원거래 ${line.sourceOperationId.slice(0, 8)}`)
  if (line.personName) parts.push(line.personName)
  if (line.departmentId) {
    const department = names?.departments?.find((row) => row.id === line.departmentId)
    parts.push(department?.name ?? line.departmentId)
  }
  if (line.txnType === 'transfer_in' || line.txnType === 'transfer_out') {
    parts.push(warehouseName ?? line.warehouseId)
  }
  if (line.reason && !/자산화|자산이 아니라 재고/.test(line.reason)) parts.push(line.reason)
  return parts.join(' · ')
}

export function isTransfer(line: LedgerLine): boolean {
  return line.txnType === 'transfer_in' || line.txnType === 'transfer_out'
}

export function isSupplyLedgerLine(line: LedgerLine): boolean {
  if (line.txnType === 'convert_out') return false
  if (isTransfer(line)) return false
  if (line.reason && /자산화|자산이 아니라 재고/.test(line.reason)) return false
  return true
}

function transferRank(txnType: LedgerTxnType): number {
  if (txnType === 'transfer_out') return 0
  if (txnType === 'transfer_in') return 1
  return 2
}

export function orderedLedger(ledger: LedgerLine[]): LedgerLine[] {
  return ledger
    .map((line, index) => ({ line, index }))
    .sort((a, b) => {
      const time = (a.line.createdAt ?? '').localeCompare(b.line.createdAt ?? '')
      if (time !== 0) return time
      if (a.line.operationId === b.line.operationId) {
        const rank = transferRank(a.line.txnType) - transferRank(b.line.txnType)
        if (rank !== 0) return rank
      }
      return a.index - b.index
    })
    .map((row) => row.line)
}

function toViewRow(
  line: LedgerLine,
  warehouseBalance: number,
  companyBalance: number,
  names?: LedgerNameMaps,
): LedgerViewRow {
  const fromName =
    line.txnType === 'transfer_in' || line.txnType === 'transfer_out'
      ? names?.warehouses?.find((row) => row.id === line.warehouseId)?.name
      : undefined
  return {
    line,
    label: TXN_LABELS[line.txnType],
    inbound: line.qtyDelta > 0 ? line.qtyDelta : null,
    outbound: line.qtyDelta < 0 ? -line.qtyDelta : null,
    warehouseBalance,
    companyBalance,
    link: formatLedgerLink(line, names, fromName),
  }
}

export function buildLedgerView(state: StockState, names?: LedgerNameMaps): LedgerViewRow[] {
  const warehouse = new Map<string, number>()
  const company = new Map<string, number>()
  return orderedLedger(state.ledger).map((line) => {
    const warehouseKey = `${line.itemId}:${line.warehouseId}`
    warehouse.set(warehouseKey, (warehouse.get(warehouseKey) ?? 0) + (countsTowardOnHand(line) ? line.qtyDelta : 0))
    if (!isTransfer(line)) {
      company.set(line.itemId, (company.get(line.itemId) ?? 0) + (countsTowardOnHand(line) ? line.qtyDelta : 0))
    } else if (!company.has(line.itemId)) {
      company.set(line.itemId, 0)
    }
    return toViewRow(line, warehouse.get(warehouseKey) ?? 0, company.get(line.itemId) ?? 0, names)
  })
}

export function buildSupplyLedgerView(state: StockState, names?: LedgerNameMaps): LedgerViewRow[] {
  const company = new Map<string, number>()
  return orderedLedger(state.ledger)
    .filter(isSupplyLedgerLine)
    .map((line) => {
      company.set(line.itemId, (company.get(line.itemId) ?? 0) + (countsTowardOnHand(line) ? line.qtyDelta : 0))
      return toViewRow(line, 0, company.get(line.itemId) ?? 0, names)
    })
}

export function filterLedgerView(rows: LedgerViewRow[], filter: LedgerFilter): LedgerViewRow[] {
  if (filter === 'in') return rows.filter((row) => row.inbound != null)
  if (filter === 'out') return rows.filter((row) => row.outbound != null)
  return rows
}
