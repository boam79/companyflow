import { describe, expect, it } from 'vitest'
import { loadContractsMenu, saveContractsMenu } from './modules'

function memoryDb() {
  const rows = new Map<string, string>()
  return {
    query: async <T>(_sql: string, params?: unknown[]) => {
      const value = rows.get(String(params?.[0] ?? ''))
      return (value ? [{ value }] : []) as T[]
    },
    exec: async (_sql: string, params?: unknown[]) => {
      rows.set(String(params?.[0]), String(params?.[1]))
    },
  }
}

describe('회사 계약 메뉴', () => {
  it('없으면 켜져 있고 끈 값은 그 회사 파일에만 남는다', async () => {
    const db = memoryDb()
    expect(await loadContractsMenu(db)).toBe(true)
    expect(await saveContractsMenu(db, false)).toBe(false)
    expect(await loadContractsMenu(db)).toBe(false)
    expect(await saveContractsMenu(db, true)).toBe(true)
    expect(await loadContractsMenu(db)).toBe(true)
  })
})
