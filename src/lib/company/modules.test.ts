import { describe, expect, it } from 'vitest'
import {
  firstEnabledModulePath,
  showModuleLink,
  loadCompanyModules,
  loadContractsMenu,
  saveCompanyModule,
  saveContractsMenu,
} from './modules'

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

  it('꺼진 메뉴로 가는 단추는 게스트가 아니면 숨긴다', () => {
    expect(showModuleLink(false, false)).toBe(false)
    expect(showModuleLink(false, true)).toBe(true)
    expect(showModuleLink(true, false)).toBe(true)
  })

  it('꺼진 구매·재고 다음의 켠 메뉴로 업무를 시작한다', () => {
    expect(firstEnabledModulePath(undefined)).toBe('/stock')
    expect(firstEnabledModulePath({ stock: false, assets: true, people: true, contracts: true })).toBe('/assets')
    expect(
      firstEnabledModulePath({ stock: false, assets: false, people: false, contracts: false }),
    ).toBe('/settings')
  })

  it('구매·재고를 꺼도 자산·입퇴사·계약은 그대로다', async () => {
    const db = memoryDb()
    expect(await loadCompanyModules(db)).toEqual({
      stock: true,
      assets: true,
      people: true,
      contracts: true,
    })
    await saveCompanyModule(db, 'stock', false)
    expect(await loadCompanyModules(db)).toEqual({
      stock: false,
      assets: true,
      people: true,
      contracts: true,
    })
  })
})
