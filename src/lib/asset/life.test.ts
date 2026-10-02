import { describe, expect, it } from 'vitest'
import { assetsFromConvert } from './book'
import {
  applyAssetLife,
  assetLifeAttachment,
  assetLifeLabel,
  executeAssetLife,
  loadAssetEventOriginal,
  loadAssetEvents,
  normalizeHangulField,
  readAssetLifeForm,
} from './life'

const DESK = assetsFromConvert('op-desk', 'item-desk', 'wh-main', 1, 't').map((row) => ({
  ...row,
  locationText: '본사 3층 총무석',
  departmentName: '총무',
  ownerName: '김담당',
}))

function lifeDb(assets: typeof DESK) {
  const statements: { sql: string; params?: unknown[] }[] = []
  const rows = [...assets]
  const db = {
    query: async <T>(sql: string, params?: unknown[]) => {
      if (sql.includes('processed_operations')) {
        const found = statements.some(
          (row) => row.sql.includes('insert into processed_operations') && row.params?.[0] === params?.[0],
        )
        return (found ? [{ operation_id: params?.[0] }] : []) as T[]
      }
      if (sql.includes('file_base64')) {
        const found = statements.find(
          (row) => row.sql.includes('insert into asset_events') && row.params?.[0] === params?.[0],
        )
        return (found
          ? [
              {
                file_name: found.params?.[9],
                file_mime: found.params?.[10],
                file_base64: found.params?.[11],
              },
            ]
          : []) as T[]
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
            file_name: row.params?.[9],
            file_mime: row.params?.[10],
          })) as T[]
      }
      return [
        {
          id: rows[0].id,
          item_id: rows[0].itemId,
          warehouse_id: rows[0].warehouseId,
          status: rows[0].status,
          employee_id: rows[0].employeeId ?? null,
          source_operation_id: rows[0].sourceOperationId,
          created_at: rows[0].createdAt,
          location_text: rows[0].locationText,
          department_name: rows[0].departmentName,
          owner_name: rows[0].ownerName,
        },
      ] as T[]
    },
    batch: async (next: { sql: string; params?: unknown[] }[]) => {
      statements.push(...next)
      const update = next.find((row) => row.sql.startsWith('update assets'))
      if (update) {
        rows[0] = {
          ...rows[0],
          locationText: String(update.params?.[0] ?? ''),
          departmentName: String(update.params?.[1] ?? ''),
          ownerName: String(update.params?.[2] ?? ''),
          status: update.params?.[3] as (typeof rows)[0]['status'],
        }
      }
    },
  }
  return { db, statements }
}

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

  it('풀어 쓴 한글은 한 글자로 모아 저장한다', () => {
    expect(normalizeHangulField('총무'.normalize('NFD'))).toBe('총무')
    expect(normalizeHangulField('  본사   3층  ')).toBe('본사 3층')
    const data = new FormData()
    data.set('kind', 'transfer')
    data.set('happenedAt', '2026-09-20')
    data.set('locationText', '본사 2층 개발석'.normalize('NFD'))
    data.set('departmentName', '총무'.normalize('NFD'))
    data.set('ownerName', '김담당')
    data.set('reason', '자리 이동')
    expect(readAssetLifeForm(data)).toMatchObject({
      kind: 'transfer',
      locationText: '본사 2층 개발석',
      departmentName: '총무',
      ownerName: '김담당',
      reason: '자리 이동',
    })
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
    const { db, statements } = lifeDb([...DESK])
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

  it('이력 첨부는 PDF·PNG·JPEG만 이 PC에 둔다', async () => {
    expect(() =>
      assetLifeAttachment({ name: 'note.txt', mime: 'text/plain', bytes: new Uint8Array([1, 2, 3]) }),
    ).toThrow(/PDF/)
    const png = assetLifeAttachment({
      name: '견본이관.png',
      mime: 'image/png',
      bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
    })
    const { db } = lifeDb([...DESK])
    await executeAssetLife(db, {
      operationId: 'op-move-file',
      assetId: 'op-desk:1',
      kind: 'transfer',
      happenedAt: '2026-09-20',
      locationText: '샘플 3층',
      ...png,
    })
    const events = await loadAssetEvents(db, 'op-desk:1')
    expect(events[0]?.fileName).toBe('견본이관.png')
    const original = await loadAssetEventOriginal(db, 'op-move-file')
    expect(original.fileName).toBe('견본이관.png')
    expect(original.fileMime).toBe('image/png')
  })
})
