import { describe, expect, it } from 'vitest'
import { assetsFromConvert } from './book'
import {
  applyAssetLife,
  assetLifeLabel,
  executeAssetLife,
  loadAssetEvents,
} from './life'

const DESK = assetsFromConvert('op-desk', 'item-desk', 'wh-main', 1, 't').map((row) => ({
  ...row,
  locationText: '본사 3층 총무석',
  departmentName: '총무',
  ownerName: '김담당',
}))

describe('자산 이관·수리·폐기', () => {
  it('이관은 위치·부서를 바꾸고 배정하지 않는다', () => {
    const next = applyAssetLife(DESK, {
      assetId: 'op-desk:1',
      kind: 'transfer',
      happenedAt: '2026-09-20',
      locationText: '본사 2층 개발석',
      departmentName: '개발',
      ownerName: '박재민',
      reason: '자리 이동',
    })
    expect(next[0]).toMatchObject({
      locationText: '본사 2층 개발석',
      departmentName: '개발',
      ownerName: '박재민',
      status: 'in_storage',
      employeeId: undefined,
    })
    expect(assetLifeLabel('transfer')).toBe('이관')
  })

  it('수리는 위치는 두고 이력만 남긴다', () => {
    const next = applyAssetLife(DESK, {
      assetId: 'op-desk:1',
      kind: 'repair',
      happenedAt: '2026-09-21',
      reason: '바퀴 교체',
    })
    expect(next[0].locationText).toBe('본사 3층 총무석')
    expect(next[0].status).toBe('in_storage')
    expect(assetLifeLabel('repair')).toBe('수리')
  })

  it('폐기는 목록에서 빼는 상태로 바꾼다', () => {
    const next = applyAssetLife(DESK, {
      assetId: 'op-desk:1',
      kind: 'dispose',
      happenedAt: '2026-09-22',
      reason: '파손',
    })
    expect(next[0].status).toBe('disposed')
    expect(assetLifeLabel('dispose')).toBe('폐기')
    expect(() =>
      applyAssetLife(next, { assetId: 'op-desk:1', kind: 'repair', happenedAt: '2026-09-23' }),
    ).toThrow(/폐기/)
  })

  it('이관에 위치가 없으면 막는다', () => {
    expect(() =>
      applyAssetLife(DESK, { assetId: 'op-desk:1', kind: 'transfer', happenedAt: '2026-09-20' }),
    ).toThrow(/위치/)
  })

  it('같은 operation은 한 번만 반영하고 이력을 남긴다', async () => {
    const statements: { sql: string; params?: unknown[] }[] = []
    const assets = [...DESK]
    const db = {
      query: async <T>(sql: string, params?: unknown[]) => {
        if (sql.includes('processed_operations')) {
          const found = statements.some(
            (row) => row.sql.includes('insert into processed_operations') && row.params?.[0] === params?.[0],
          )
          return (found ? [{ operation_id: params?.[0] }] : []) as T[]
        }
        if (sql.includes('from asset_events')) {
          return statements
            .filter((row) => row.sql.includes('insert into asset_events'))
            .filter((row) => !params?.[0] || row.params?.[1] === params[0])
            .map((row) => ({
              id: row.params?.[0],
              asset_id: row.params?.[1],
              kind: row.params?.[2],
              happened_at: row.params?.[3],
              reason: row.params?.[4],
              location_text: row.params?.[5],
              department_name: row.params?.[6],
              owner_name: row.params?.[7],
              created_at: row.params?.[8],
            })) as T[]
        }
        return [
          {
            id: assets[0].id,
            item_id: assets[0].itemId,
            warehouse_id: assets[0].warehouseId,
            status: assets[0].status,
            employee_id: assets[0].employeeId ?? null,
            source_operation_id: assets[0].sourceOperationId,
            created_at: assets[0].createdAt,
            location_text: assets[0].locationText,
            department_name: assets[0].departmentName,
            owner_name: assets[0].ownerName,
          },
        ] as T[]
      },
      batch: async (next: { sql: string; params?: unknown[] }[]) => {
        statements.push(...next)
        const update = next.find((row) => row.sql.startsWith('update assets'))
        if (update) {
          assets[0] = {
            ...assets[0],
            locationText: String(update.params?.[0] ?? ''),
            departmentName: String(update.params?.[1] ?? ''),
            ownerName: String(update.params?.[2] ?? ''),
            status: update.params?.[3] as (typeof assets)[0]['status'],
          }
        }
      },
    }
    const first = await executeAssetLife(db, {
      operationId: 'op-move-1',
      assetId: 'op-desk:1',
      kind: 'transfer',
      happenedAt: '2026-09-20',
      locationText: '본사 2층 개발석',
      departmentName: '개발',
      ownerName: '박재민',
      reason: '자리 이동',
    })
    const second = await executeAssetLife(db, {
      operationId: 'op-move-1',
      assetId: 'op-desk:1',
      kind: 'transfer',
      happenedAt: '2026-09-20',
      locationText: '본사 2층 개발석',
    })
    expect(first.status).toBe('applied')
    expect(second.status).toBe('duplicate')
    expect(statements.filter((row) => row.sql.includes('insert into asset_events'))).toHaveLength(1)
    const events = await loadAssetEvents(db, 'op-desk:1')
    expect(events[0]).toMatchObject({ kind: 'transfer', locationText: '본사 2층 개발석', reason: '자리 이동' })
  })
})
