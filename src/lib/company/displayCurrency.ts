import { ORDER_CURRENCIES, orderCurrencyLabel } from '../stock/inventoryView'

export const DISPLAY_CURRENCY_KEY = 'display_currency'

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
