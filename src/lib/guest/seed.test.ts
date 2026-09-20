import { describe, expect, it } from 'vitest'
import { PAPER_ITEM } from '../master/book'
import { assertGuestOpensMemory, GUEST_PAPER_IN_OP, GUEST_PAPER_QTY, seedGuestCompany } from './seed'

describe('게스트 샘플 시드', () => {
  it('본사 시드가 아니라 견본 이름만 넣는다', async () => {
    const execSql: string[] = []
    const execParams: unknown[][] = []
    const batchParams: unknown[][] = []
    await seedGuestCompany({
      exec: async (sql, params) => {
        execSql.push(sql)
        execParams.push(params ?? [])
      },
      query: async () => [],
      batch: async (statements) => {
        for (const row of statements) {
          execSql.push(row.sql)
          batchParams.push(row.params ?? [])
        }
      },
    })
    const names = [...execParams, ...batchParams].flat().filter((value) => typeof value === 'string')
    expect(names).toEqual(
      expect.arrayContaining([
        '샘플총무',
        '견본 김대리',
        '데모 이사원',
        '샘플 복사용지',
        '샘플창고',
        '견본문구',
        '샘플 책상',
        '샘플 사무실 임대',
      ]),
    )
    expect(names).not.toContain('김담당')
    expect(names).not.toContain('박재민')
    expect(names).not.toContain('오세훈')
    expect(names).not.toContain('본사 3층 임대')
    expect(names).not.toContain('DSK-001')
    expect(names).not.toContain(PAPER_ITEM.name)
    expect(execSql.filter((sql) => sql.includes('insert or ignore into assets')).every((sql) => (sql.match(/\?/g) ?? []).length === 11)).toBe(true)
    expect(execSql.some((sql) => sql.includes('insert into stock_ledger'))).toBe(true)
    expect(batchParams.some((params) => params.includes(GUEST_PAPER_IN_OP))).toBe(true)
    expect(batchParams.some((params) => params.includes(GUEST_PAPER_QTY))).toBe(true)
    expect(GUEST_PAPER_QTY).toBe(7)
  })

  it('게스트가 메모리 아닌 VFS를 열면 막는다', () => {
    expect(() => assertGuestOpensMemory(true, 'opfs-sahpool')).toThrow(/메모리/)
    expect(() => assertGuestOpensMemory(true, 'memory')).not.toThrow()
    expect(() => assertGuestOpensMemory(false, 'opfs-sahpool')).not.toThrow()
  })
})
