import { describe, expect, it } from 'vitest'
import { PAPER_ITEM } from '../master/book'
import { GUEST_PAPER_IN_OP, GUEST_PAPER_QTY, seedGuestCompany } from './seed'

describe('게스트 샘플 시드', () => {
  it('부서·직원·품목·거래처·창고·자산·계약과 복사용지 입고를 넣는다', async () => {
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
        '총무',
        '김담당',
        '박재민',
        PAPER_ITEM.name,
        '본사창고',
        '한국임대',
        '책상',
        '본사 3층 임대',
      ]),
    )
    expect(execSql.some((sql) => sql.includes('insert or ignore into contracts'))).toBe(true)
    expect(execSql.some((sql) => sql.includes('insert into stock_ledger'))).toBe(true)
    expect(batchParams.some((params) => params.includes(GUEST_PAPER_IN_OP))).toBe(true)
    expect(batchParams.some((params) => params.includes(GUEST_PAPER_QTY))).toBe(true)
    expect(batchParams.some((params) => params.includes(PAPER_ITEM.id))).toBe(true)
  })
})
