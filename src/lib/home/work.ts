export { CONTRACT_WATCH_DAYS, contractWatchLabel, watchContracts, type ContractWatch } from '../contracts/watch'

export const RECENT_WORK_LIMIT = 8
export const HOME_FRONT_PANEL_TITLES = ['재고 부족', '입사 중', '계약 기한'] as const

export type ReceiptWait = {
  orderId: string
  itemName: string
  remainingQty: number
  status: 'draft' | 'confirmed'
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
  direct_in: '입고',
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

export function waitingReceipts(orders: ReceiptWait[]): ReceiptWait[] {
  return orders.filter((row) => row.status === 'confirmed' && row.remainingQty > 0)
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

export { lowStock, type LowStock } from '../stock/inventoryView'
