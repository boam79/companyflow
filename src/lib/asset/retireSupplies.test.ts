import { describe, expect, it } from 'vitest'
import { PAPER_ITEM } from '../master/book'
import { retireSupplyAssets } from './retireSupplies'

describe('비품 자산 해제', () => {
  it('복사용지 AST를 지우고 재고로 되돌린다', async () => {
    const execs: { sql: string; params?: unknown[] }[] = []
    const assets = [
      { id: 'p1', item_id: PAPER_ITEM.id, warehouse_id: 'wh-main' },
      { id: 'p2', item_id: PAPER_ITEM.id, warehouse_id: 'wh-main' },
      { id: 'd1', item_id: 'item-desk', warehouse_id: 'wh-main' },
    ]
    const db = {
      query: async <T>(sql: string) => {
        if (sql.includes('from items')) {
          return [
            { id: PAPER_ITEM.id, name: '복사용지', stock_managed: 1, asset_managed: 0 },
            { id: 'item-desk', name: '책상', stock_managed: 1, asset_managed: 1 },
          ] as T[]
        }
        if (sql.includes('from assets')) return assets as T[]
        if (sql.includes('processed_operations')) return [] as T[]
        return [] as T[]
      },
      exec: async (sql: string, params?: unknown[]) => {
        execs.push({ sql, params })
      },
    }
    expect(await retireSupplyAssets(db)).toBe(2)
    expect(execs.some((row) => /direct_in/.test(row.sql) && row.params?.includes(2))).toBe(true)
    expect(execs.some((row) => /delete from assets/i.test(row.sql) && row.params?.includes(PAPER_ITEM.id))).toBe(
      true,
    )
    expect(execs.some((row) => row.params?.includes('item-desk') && /delete from assets/i.test(row.sql))).toBe(
      false,
    )
  })
})
