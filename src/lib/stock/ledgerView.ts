import { countsTowardOnHand, type LedgerLine, type LedgerTxnType, type StockState } from './engine'

export type LedgerFilter = 'all' | 'in' | 'out'

export const TXN_LABELS: Record<LedgerTxnType, string> = {
  receipt: '수령 입고',
  direct_in: '입고',
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

export function isOpaqueLedgerRef(value?: string | null) {
  const text = value?.trim() ?? ''
  if (!text) return true
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text)
}

export function publicOrderRef(value?: string | null) {
  const text = value?.trim() ?? ''
  if (!text || isOpaqueLedgerRef(text)) return ''
  if (/^(guest:|sample:|op-|item-|emp-|wh-|dept-)/i.test(text)) return ''
  return text
}

export function publicItemLabel(name?: string | null, id?: string | null) {
  const text = (name ?? '').trim() || (id ?? '').trim()
  if (!text || isOpaqueLedgerRef(text)) return '비품'
  if (/^(guest:|item-[0-9a-f]{8}-)/i.test(text)) return '비품'
  return (name ?? '').trim() || '비품'
}

export function formatLedgerLink(
  line: LedgerLine,
  names?: LedgerNameMaps,
  warehouseName?: string,
): string {
  const parts: string[] = []
  const orderRef = publicOrderRef(line.orderId)
  if (orderRef) parts.push(`발주 ${orderRef}`)
  const sourceRef = publicOrderRef(line.sourceOperationId)
  if (sourceRef) parts.push(`원거래 ${sourceRef}`)
  if (line.personName) parts.push(line.personName)
  if (line.departmentId) {
    const department = names?.departments?.find((row) => row.id === line.departmentId)
    const departmentName = department?.name ?? publicOrderRef(line.departmentId)
    if (departmentName) parts.push(departmentName)
  }
  if (line.txnType === 'transfer_in' || line.txnType === 'transfer_out') {
    const warehouse = warehouseName ?? publicOrderRef(line.warehouseId)
    if (warehouse) parts.push(warehouse)
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

export function stockEmptyLedgerLead() {
  return '입출고 원장이 없습니다. 오른쪽에서 입고·반출을 확정하면 이 표에 이어집니다.'
}

export function stockEmptyLedgerFilterLead() {
  return '이 구분의 입출고가 없습니다. 전체에서 입고·출고가 한 줄씩 이어집니다.'
}
