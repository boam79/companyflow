export const CONTRACT_WATCH_DAYS = 60
export const RECENT_WORK_LIMIT = 8

export type ReceiptWait = {
  orderId: string
  itemName: string
  remainingQty: number
  status: 'draft' | 'confirmed'
}

export type ContractWatch = {
  title: string
  counterparty: string
  endAt?: string
  watch: '만료' | '만료 예정'
}

export type RecentWork = {
  id: string
  at: string
  label: string
  detail: string
  to: '/stock' | '/people' | '/contracts'
}

const TXN_LABELS: Record<string, string> = {
  receipt: '수령 입고',
  direct_in: '직접 입고',
  issue: '반출',
  outbound: '출고',
  return: '반납 입고',
  adjust: '실사 조정',
  reversal: '정정',
}

const PEOPLE_LABELS: Record<string, string> = {
  hire: '입사',
  rehire: '재입사',
  leave: '퇴사',
}

function addDays(iso: string, days: number) {
  const [year, month, day] = iso.split('-').map(Number)
  const date = new Date(year, (month ?? 1) - 1, day ?? 1)
  date.setDate(date.getDate() + days)
  const yyyy = String(date.getFullYear())
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export function waitingReceipts(orders: ReceiptWait[]): ReceiptWait[] {
  return orders.filter((row) => row.status === 'confirmed' && row.remainingQty > 0)
}

export function contractWatchLabel(endAt: string | undefined, today: string): ContractWatch['watch'] | null {
  if (!endAt) return null
  if (endAt < today) return '만료'
  if (endAt <= addDays(today, CONTRACT_WATCH_DAYS)) return '만료 예정'
  return null
}

export function watchContracts(
  rows: { title: string; counterparty: string; endAt?: string }[],
  today: string,
): ContractWatch[] {
  const watched: ContractWatch[] = []
  for (const row of rows) {
    const watch = contractWatchLabel(row.endAt, today)
    if (!watch) continue
    watched.push({
      title: row.title,
      counterparty: row.counterparty,
      endAt: row.endAt,
      watch,
    })
  }
  return watched.sort((a, b) => (a.endAt ?? '').localeCompare(b.endAt ?? ''))
}

export function stockRecent(
  lines: { id: string; createdAt?: string; txnType: string; itemId: string; qtyDelta: number }[],
  items: { id: string; name: string }[],
): RecentWork[] {
  return lines.flatMap((line) => {
    const label = TXN_LABELS[line.txnType]
    if (!label || !line.createdAt) return []
    const itemName = items.find((item) => item.id === line.itemId)?.name ?? line.itemId
    return [
      {
        id: line.id,
        at: line.createdAt,
        label,
        detail: `${itemName} ${Math.abs(line.qtyDelta)}`,
        to: '/stock' as const,
      },
    ]
  })
}

export function peopleRecent(
  events: { employeeId: string; kind: string; occurredAt: string }[],
  employees: { id: string; name: string }[],
): RecentWork[] {
  return events.flatMap((event) => {
    const label = PEOPLE_LABELS[event.kind]
    if (!label) return []
    const name = employees.find((row) => row.id === event.employeeId)?.name ?? event.employeeId
    return [
      {
        id: `${event.employeeId}-${event.kind}-${event.occurredAt}`,
        at: event.occurredAt,
        label,
        detail: name,
        to: '/people' as const,
      },
    ]
  })
}

export function contractRecent(rows: { id: string; title: string; createdAt?: string }[]): RecentWork[] {
  return rows.flatMap((row) => {
    if (!row.createdAt) return []
    return [
      {
        id: row.id,
        at: row.createdAt,
        label: '계약 초안',
        detail: row.title,
        to: '/contracts' as const,
      },
    ]
  })
}

export function recentWork(rows: RecentWork[], limit = RECENT_WORK_LIMIT): RecentWork[] {
  return [...rows]
    .filter((row) => row.at)
    .sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id))
    .slice(0, limit)
}

export type LowStock = {
  itemId: string
  itemName: string
  onHand: number
  minStock: number
  managed?: boolean
}

export function lowStock(rows: LowStock[]): LowStock[] {
  return rows
    .filter((row) => row.managed !== false && row.minStock > 0 && row.onHand < row.minStock)
    .sort((a, b) => a.onHand - a.minStock - (b.onHand - b.minStock) || a.itemName.localeCompare(b.itemName, 'ko'))
}
