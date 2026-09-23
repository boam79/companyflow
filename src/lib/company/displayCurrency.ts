import { ORDER_CURRENCIES, orderCurrencyLabel } from '../stock/inventoryView'

export const DISPLAY_CURRENCY_KEY = 'display_currency'
export const DISPLAY_GROUPING_KEY = 'display_grouping'
export const GROUPING_SAMPLE = 12345

export function displayCurrencyCode(value: string | null | undefined) {
  const code = value?.trim() || 'KRW'
  return ORDER_CURRENCIES.some((row) => row.id === code) ? code : 'KRW'
}

export function assertDisplayCurrency(value: string) {
  const code = value.trim()
  if (!ORDER_CURRENCIES.some((row) => row.id === code)) {
    throw new Error('통화는 원 또는 달러만 받습니다.')
  }
  return code
}

export function displayCurrencyName(value: string | null | undefined) {
  return orderCurrencyLabel(displayCurrencyCode(value))
}

type CurrencyDb = {
  query: <T>(sql: string, params?: unknown[]) => Promise<T[]>
  exec: (sql: string, params?: unknown[]) => Promise<void>
}

export async function loadDisplayCurrency(db: Pick<CurrencyDb, 'query'>) {
  const rows = await db.query<{ value: string }>('select value from meta where key = ?', [DISPLAY_CURRENCY_KEY])
  return displayCurrencyCode(rows[0]?.value)
}

export async function saveDisplayCurrency(db: CurrencyDb, value: string) {
  const code = assertDisplayCurrency(value)
  await db.exec('insert or replace into meta(key, value) values(?, ?)', [DISPLAY_CURRENCY_KEY, code])
  return code
}

export function displayGroupingOn(value: string | null | undefined) {
  return value?.trim() !== 'off'
}

export function formatCompanyNumber(value: number, grouping: boolean) {
  if (!Number.isFinite(value)) return ''
  return grouping ? value.toLocaleString('ko-KR') : String(value)
}

export async function loadDisplayGrouping(db: Pick<CurrencyDb, 'query'>) {
  const rows = await db.query<{ value: string }>('select value from meta where key = ?', [DISPLAY_GROUPING_KEY])
  return displayGroupingOn(rows[0]?.value)
}

export async function saveDisplayGrouping(db: CurrencyDb, grouping: boolean) {
  const value = grouping ? 'on' : 'off'
  await db.exec('insert or replace into meta(key, value) values(?, ?)', [DISPLAY_GROUPING_KEY, value])
  return grouping
}

export const DISPLAY_TIMEZONE_KEY = 'display_timezone'

export const DISPLAY_TIMEZONES = [
  { id: 'Asia/Seoul', name: '서울' },
  { id: 'UTC', name: '세계시' },
] as const

export function displayTimezoneId(value: string | null | undefined) {
  const id = value?.trim() || 'Asia/Seoul'
  return DISPLAY_TIMEZONES.some((row) => row.id === id) ? id : 'Asia/Seoul'
}

export function assertDisplayTimezone(value: string) {
  const id = value.trim()
  if (!DISPLAY_TIMEZONES.some((row) => row.id === id)) {
    throw new Error('시간대는 서울 또는 세계시만 받습니다.')
  }
  return id
}

export function formatCompanyClock(date: Date, timeZone: string) {
  const id = displayTimezoneId(timeZone)
  const zone = DISPLAY_TIMEZONES.find((row) => row.id === id) ?? DISPLAY_TIMEZONES[0]
  const clock = new Intl.DateTimeFormat('en-GB', {
    timeZone: id,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date)
  return `${zone.name} ${clock}`
}

export function formatCompanyDate(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: displayTimezoneId(timeZone) }).format(date)
}

export async function loadDisplayTimezone(db: Pick<CurrencyDb, 'query'>) {
  const rows = await db.query<{ value: string }>('select value from meta where key = ?', [DISPLAY_TIMEZONE_KEY])
  return displayTimezoneId(rows[0]?.value)
}

export async function saveDisplayTimezone(db: CurrencyDb, value: string) {
  const id = assertDisplayTimezone(value)
  await db.exec('insert or replace into meta(key, value) values(?, ?)', [DISPLAY_TIMEZONE_KEY, id])
  return id
}

export type CompanyDisplayState = {
  currency: string
  grouping: boolean
  timeZone: string
}

export async function loadCompanyDisplay(db: Pick<CurrencyDb, 'query'>): Promise<CompanyDisplayState> {
  return {
    currency: await loadDisplayCurrency(db),
    grouping: await loadDisplayGrouping(db),
    timeZone: await loadDisplayTimezone(db),
  }
}
