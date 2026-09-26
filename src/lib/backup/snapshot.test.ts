import { describe, expect, it } from 'vitest'
import { applySnapshot, dumpTables } from './snapshot'
import type { SnapshotDb } from './snapshot'

function memoryDb(initial: Record<string, Record<string, unknown>[]>): SnapshotDb & { tables: Record<string, Record<string, unknown>[]> } {
  const tables = structuredClone(initial)
  return {
    tables,
    async query<T>(sql: string) {
      if (sql.includes('sqlite_master')) {
        return Object.keys(tables).map((name) => ({ name })) as T[]
      }
      const name = sql.replace(/select \* from /i, '').trim()
      return structuredClone(tables[name] ?? []) as T[]
    },
    async exec() {},
    async batch(statements) {
      if (statements.some((row) => row.sql === 'fail')) throw new Error('깨진 백업')
      for (const statement of statements) {
        const del = statement.sql.match(/^delete from ([a-z0-9_]+)$/i)
        if (del) {
          tables[del[1]] = []
          continue
        }
        const ins = statement.sql.match(/^insert into ([a-z0-9_]+)\(([^)]+)\) values/i)
        if (!ins || !statement.params) continue
        const name = ins[1]
        const cols = ins[2].split(',').map((col) => col.trim())
        const row: Record<string, unknown> = {}
        cols.forEach((col, index) => {
          row[col] = statement.params?.[index]
        })
        tables[name] = [...(tables[name] ?? []), row]
      }
    },
  }
}

describe('백업 표 적용', () => {
  it('실패하면 적용 전 표로 되돌린다', async () => {
    const db = memoryDb({ meta: [{ key: 'now', value: 'keep' }] })
    await expect(
      applySnapshot(db, {
        companyId: 'co-a',
        schemaVersion: 1,
        dumpedAt: '2026-09-26T00:00:00.000Z',
        tables: { meta: [{ key: 'now', value: 'new' }] },
      }),
    ).resolves.toBeUndefined()
    expect(db.tables.meta[0]).toEqual({ key: 'now', value: 'new' })

    const broken = memoryDb({ meta: [{ key: 'now', value: 'keep' }] })
    const originalBatch = broken.batch.bind(broken)
    let calls = 0
    broken.batch = async (statements) => {
      calls += 1
      if (calls === 1) {
        await originalBatch(statements.filter((row) => /^delete /i.test(row.sql)))
        throw new Error('깨진 백업')
      }
      return originalBatch(statements)
    }
    await expect(
      applySnapshot(broken, {
        companyId: 'co-a',
        schemaVersion: 1,
        dumpedAt: '2026-09-26T00:00:00.000Z',
        tables: { meta: [{ key: 'now', value: 'new' }] },
      }),
    ).rejects.toThrow(/깨진 백업/)
    expect(broken.tables.meta[0]).toEqual({ key: 'now', value: 'keep' })
  })

  it('열린 표를 덤프한다', async () => {
    const db = memoryDb({ departments: [{ id: 'd1', name: '총무' }] })
    expect(await dumpTables(db)).toEqual({ departments: [{ id: 'd1', name: '총무' }] })
  })
})
