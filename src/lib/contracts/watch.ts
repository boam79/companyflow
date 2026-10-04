export const CONTRACT_WATCH_DAYS = 60

export type ContractWatch = {
  title: string
  counterparty: string
  endAt?: string
  watch: '만료' | '만료 예정'
}

export function shiftYmd(iso: string, days: number) {
  const [year, month, day] = iso.split('-').map(Number)
  const date = new Date(year, (month ?? 1) - 1, day ?? 1)
  date.setDate(date.getDate() + days)
  const yyyy = String(date.getFullYear())
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export function contractWatchLabel(endAt: string | undefined, today: string): ContractWatch['watch'] | null {
  if (!endAt) return null
  if (endAt < today) return '만료'
  if (endAt <= shiftYmd(today, CONTRACT_WATCH_DAYS)) return '만료 예정'
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

export function ymdDiffDays(from: string, to: string) {
  const start = Date.parse(`${from}T00:00:00`)
  const end = Date.parse(`${to}T00:00:00`)
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0
  return Math.round((end - start) / 86_400_000)
}

export function contractDueCaption(endAt: string | undefined, today: string) {
  const watch = contractWatchLabel(endAt, today)
  if (!watch || !endAt) return ''
  if (watch === '만료') {
    const past = ymdDiffDays(endAt, today)
    return past > 0 ? `만료 · ${past}일 지남` : '만료'
  }
  const days = ymdDiffDays(today, endAt)
  if (days === 0) return '만료 예정 · 오늘 종료'
  if (days > 0) return `만료 예정 · ${days}일 전`
  return '만료 예정'
}

export function contractDueNotice(count: number) {
  return count ? `기한 알림 ${count}건이 ${CONTRACT_WATCH_DAYS}일 안에 끝납니다.` : ''
}
