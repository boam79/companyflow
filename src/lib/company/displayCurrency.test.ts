import { describe, expect, it } from 'vitest'
import { assertDisplayCurrency, assertDisplayTimezone, displayCurrencyName, formatCompanyClock, formatCompanyDate, formatCompanyMoney, formatCompanyNumber, loadCompanyDisplay, loadDisplayCurrency, loadDisplayGrouping, loadDisplayTimezone, saveDisplayCurrency, saveDisplayGrouping, saveDisplayTimezone } from './displayCurrency'

function memoryDb(initial?: string) {
  const rows = new Map<string, string>()
  if (initial) rows.set('display_currency', initial)
  return {
  rows,
  query: async <T>(sql: string, params?: unknown[]) => {
    if (!sql.includes('meta')) return [] as T[]
    const key = String(params?.[0] ?? '')
    const value = rows.get(key)
    return (value ? [{ value }] : []) as T[]
  },
    exec: async (_sql: string, params?: unknown[]) => {
      rows.set(String(params?.[0]), String(params?.[1]))
    },
  }
}

describe('회사 표시 통화', () => {
  it('없으면 원이고 모르는 값은 원으로 둔다', async () => {
    expect(await loadDisplayCurrency(memoryDb())).toBe('KRW')
    expect(displayCurrencyName('EUR')).toBe('원')
    expect(displayCurrencyName('USD')).toBe('달러')
  })

  it('원과 달러만 이 회사 원본에 저장한다', async () => {
    const db = memoryDb()
    expect(await saveDisplayCurrency(db, 'USD')).toBe('USD')
    expect(await loadDisplayCurrency(db)).toBe('USD')
    expect(() => assertDisplayCurrency('EUR')).toThrow(/통화/)
  })

  it('자리 구분은 기본으로 켜고 이 회사 원본에만 끈다', async () => {
    const db = memoryDb()
    expect(await loadDisplayGrouping(db)).toBe(true)
    expect(formatCompanyNumber(12345, true)).toBe('12,345')
    expect(formatCompanyNumber(12345, false)).toBe('12345')
    expect(await saveDisplayGrouping(db, false)).toBe(false)
    expect(await loadDisplayGrouping(db)).toBe(false)
  })

  it('시간대는 기본 서울이고 세계시는 아홉 시간 앞이다', async () => {
    const at = new Date('2026-09-22T12:00:00Z')
    const db = memoryDb()
    expect(await loadDisplayTimezone(db)).toBe('Asia/Seoul')
    expect(formatCompanyClock(at, 'Asia/Seoul')).toBe('서울 21:00')
    expect(formatCompanyClock(at, 'UTC')).toBe('세계시 12:00')
    expect(formatCompanyDate(new Date('2026-09-23T23:13:00Z'), 'UTC')).toBe('2026-09-23')
    expect(formatCompanyDate(new Date('2026-09-23T23:13:00Z'), 'Asia/Seoul')).toBe('2026-09-24')
    expect(await saveDisplayTimezone(db, 'UTC')).toBe('UTC')
    expect(await loadDisplayTimezone(db)).toBe('UTC')
    expect(() => assertDisplayTimezone('America/New_York')).toThrow(/시간대/)
  })

  it('금액은 회사 자리 구분과 통화 이름을 따른다', () => {
    expect(formatCompanyMoney(12000000, true, 'KRW')).toBe('12,000,000원')
    expect(formatCompanyMoney(12000000, false, 'USD')).toBe('12000000달러')
  })

  it('회사 파일마다 표시를 따로 읽는다', async () => {
    const db = memoryDb()
    expect(await loadCompanyDisplay(db)).toEqual({ currency: 'KRW', grouping: true, timeZone: 'Asia/Seoul' })
    await saveDisplayCurrency(db, 'USD')
    await saveDisplayGrouping(db, false)
    await saveDisplayTimezone(db, 'UTC')
    expect(await loadCompanyDisplay(db)).toEqual({ currency: 'USD', grouping: false, timeZone: 'UTC' })
  })
})
