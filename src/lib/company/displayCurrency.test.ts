import { describe, expect, it } from 'vitest'
import { assertDisplayCurrency, displayCurrencyName, loadDisplayCurrency, saveDisplayCurrency } from './displayCurrency'

function memoryDb(initial?: string) {
  const rows = new Map<string, string>()
  if (initial) rows.set('display_currency', initial)
  return {
    rows,
    query: async <T>(sql: string) => {
      if (!sql.includes('meta')) return [] as T[]
      const value = rows.get('display_currency')
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
})
