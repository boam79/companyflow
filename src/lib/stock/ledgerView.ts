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
  partners?: { id: string; name: string }[]
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

export function publicRecorderName(value?: string | null) {
  const text = value?.trim() ?? ''
  if (!text) return ''
  if (/@/.test(text)) return ''
  return publicOrderRef(text)
}

export function sessionRecorderName(
  user?: { user_metadata?: Record<string, unknown> } | null,
  guest = false,
) {
  if (guest || !user) return undefined
  const meta = user.user_metadata ?? {}
  const name = [meta.full_name, meta.name, meta.display_name]
    .map((value) => String(value ?? '').trim())
    .find(Boolean)
  return publicRecorderName(name) || undefined
}

export function publicItemLabel(name?: string | null, id?: string | null) {
  const text = (name ?? '').trim() || (id ?? '').trim()
  if (!text || isOpaqueLedgerRef(text)) return '비품'
  if (/^(guest:|item-[0-9a-f]{8}-)/i.test(text)) return '비품'
  return (name ?? '').trim() || '비품'
}

export function ledgerItemCaption(line: LedgerLine, liveName?: string | null) {
  const name = publicItemLabel(line.itemName || liveName, line.itemId)
  const unit = publicRecorderName(line.itemUnit)
  const kind = publicRecorderName(line.purchaseKind)
  return [name, unit, kind].filter(Boolean).join(' · ')
}

export function formatLedgerLink(
  line: LedgerLine,
  names?: LedgerNameMaps,
  warehouseName?: string,
): string {
  const parts: string[] = []
  const orderRef = publicOrderRef(line.orderId)
  if (orderRef) parts.push(`발주 ${orderRef}`)
  if (line.txnType === 'supplier_return' && line.sourceOperationId) {
    parts.push('원입고')
  } else {
    const sourceRef = publicOrderRef(line.sourceOperationId)
    if (sourceRef) parts.push(`원거래 ${sourceRef}`)
  }
  if (line.personName) parts.push(line.personName)
  const departmentName =
    publicRecorderName(line.departmentName) ||
    names?.departments?.find((row) => row.id === line.departmentId)?.name ||
    publicOrderRef(line.departmentId)
  if (departmentName) parts.push(departmentName)
  if (line.partnerId || line.partnerName) {
    const partner = names?.partners?.find((row) => row.id === line.partnerId)
    const partnerName =
      publicRecorderName(line.partnerName) || partner?.name || publicOrderRef(line.partnerId)
    if (partnerName) parts.push(partnerName)
  }
  if (line.purpose?.trim()) parts.push(line.purpose.trim())
  if (line.dueReturnAt?.trim()) parts.push(`반납 예정 ${line.dueReturnAt.trim()}`)
  if (line.txnType === 'direct_in' && line.businessDate?.trim()) parts.push(`입고 ${line.businessDate.trim()}`)
  const recorder = publicRecorderName(line.recordedBy)
  if (recorder && line.txnType === 'direct_in') parts.push(`등록 ${recorder}`)
  if (recorder && line.txnType === 'issue' && recorder !== line.personName?.trim()) parts.push(`입력 ${recorder}`)
  if (line.memo?.trim()) parts.push(line.memo.trim())
  if (line.fileName?.trim()) parts.push(line.fileName.trim())
  if (line.txnType === 'transfer_in' || line.txnType === 'transfer_out') {
    const warehouse =
      warehouseName || publicRecorderName(line.warehouseName) || publicOrderRef(line.warehouseId)
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
      ? publicRecorderName(line.warehouseName) ||
        names?.warehouses?.find((row) => row.id === line.warehouseId)?.name
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

export type LedgerJump = {
  line: LedgerLine
  button: string
  caption: string
}

export function ledgerJumpCaption(line: LedgerLine): string {
  const parts = [TXN_LABELS[line.txnType]]
  const person = line.personName?.trim()
  if (person && !isOpaqueLedgerRef(person) && !/^(guest:)/i.test(person)) parts.push(person)
  return parts.join(' · ')
}

export function ledgerFollowButton(line: LedgerLine): string {
  if (line.txnType === 'reversal') return '정정으로'
  if (line.txnType === 'return') return '반납으로'
  return '이 줄로'
}

export function ledgerSourceLine(ledger: LedgerLine[], line: LedgerLine): LedgerLine | undefined {
  const source = line.sourceOperationId?.trim()
  if (!source) return undefined
  return orderedLedger(ledger.filter(isSupplyLedgerLine)).find((row) => row.operationId === source)
}

export function ledgerFollowLines(ledger: LedgerLine[], line: LedgerLine): LedgerLine[] {
  const op = line.operationId?.trim()
  if (!op) return []
  return orderedLedger(ledger.filter(isSupplyLedgerLine)).filter(
    (row) => row.sourceOperationId === op && row.id !== line.id,
  )
}

export function ledgerRelatedJumps(ledger: LedgerLine[], selected: LedgerLine | null): LedgerJump[] {
  if (!selected) return []
  const jumps: LedgerJump[] = []
  const source = ledgerSourceLine(ledger, selected)
  if (source) {
    jumps.push({ line: source, button: '원거래로', caption: ledgerJumpCaption(source) })
  }
  for (const follow of ledgerFollowLines(ledger, selected)) {
    jumps.push({
      line: follow,
      button: ledgerFollowButton(follow),
      caption: ledgerJumpCaption(follow),
    })
  }
  return jumps
}

export function stockEmptyLedgerLead() {
  return '입출고 원장이 없습니다. 오른쪽에서 입고·반출을 확정하면 이 표에 이어집니다.'
}

export function stockEmptyLedgerFilterLead() {
  return '이 구분의 입출고가 없습니다. 전체에서 입고·출고가 한 줄씩 이어집니다.'
}
