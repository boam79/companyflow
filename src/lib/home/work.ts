export const CONTRACT_WATCH_DAYS = 60

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
