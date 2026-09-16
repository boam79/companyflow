export const ASSET_TABLE_SQL = [
  `create table if not exists assets (
    id text primary key,
    item_id text not null,
    warehouse_id text not null,
    status text not null,
    employee_id text,
    source_operation_id text not null,
    created_at text not null
  );`,
]

export type AssetRecord = {
  id: string
  itemId: string
  warehouseId: string
  status: 'in_storage' | 'assigned'
  employeeId?: string
  sourceOperationId: string
  createdAt?: string
}

export function assetNumber(id: string): string {
  const [operationId, seq] = id.split(':')
  const short = operationId.replace(/-/g, '').slice(0, 8).toUpperCase()
  return `AST-${short}-${seq || '1'}`
}

export function assetIdsForConvert(operationId: string, qty: number): string[] {
  return Array.from({ length: qty }, (_, index) => `${operationId}:${index + 1}`)
}

export function assetsFromConvert(
  operationId: string,
  itemId: string,
  warehouseId: string,
  qty: number,
  createdAt: string,
): AssetRecord[] {
  return assetIdsForConvert(operationId, qty).map((id) => ({
    id,
    itemId,
    warehouseId,
    status: 'in_storage',
    sourceOperationId: operationId,
    createdAt,
  }))
}

export async function loadAssets(
  db: { query: <T>(sql: string, params?: unknown[]) => Promise<T[]> },
): Promise<AssetRecord[]> {
  const rows = await db.query<{
    id: string
    item_id: string
    warehouse_id: string
    status: 'in_storage' | 'assigned'
    employee_id?: string | null
    source_operation_id: string
    created_at?: string | null
  }>('select id, item_id, warehouse_id, status, employee_id, source_operation_id, created_at from assets order by created_at, id')
  return rows.map((row) => ({
    id: row.id,
    itemId: row.item_id,
    warehouseId: row.warehouse_id,
    status: row.status,
    employeeId: row.employee_id ?? undefined,
    sourceOperationId: row.source_operation_id,
    createdAt: row.created_at ?? undefined,
  }))
}

export function applyAssignAsset(
  assets: AssetRecord[],
  command: { assetId: string; employeeId: string },
  employee?: { leftAt?: string },
): AssetRecord[] {
  const asset = assets.find((row) => row.id === command.assetId)
  if (!asset) throw new Error('자산을 찾을 수 없습니다.')
  if (asset.status === 'assigned') throw new Error('이미 배정된 자산입니다.')
  if (!command.employeeId.trim()) throw new Error('배정할 직원이 필요합니다.')
  if (employee?.leftAt) throw new Error('퇴사한 직원에게는 배정할 수 없습니다.')
  return assets.map((row) =>
    row.id === command.assetId
      ? { ...row, status: 'assigned' as const, employeeId: command.employeeId }
      : row,
  )
}

export function applyReturnAsset(
  assets: AssetRecord[],
  command: { assetId: string },
): AssetRecord[] {
  const asset = assets.find((row) => row.id === command.assetId)
  if (!asset) throw new Error('자산을 찾을 수 없습니다.')
  if (asset.status !== 'assigned') throw new Error('배정된 자산만 회수할 수 있습니다.')
  return assets.map((row) =>
    row.id === command.assetId ? { ...row, status: 'in_storage' as const, employeeId: undefined } : row,
  )
}

export async function executeAssignAsset(
  db: {
    query: <T>(sql: string, params?: unknown[]) => Promise<T[]>
    batch: (statements: { sql: string; params?: unknown[] }[]) => Promise<void>
  },
  command: { operationId: string; assetId: string; employeeId: string },
  createdAt = new Date().toISOString(),
): Promise<{ status: 'applied' | 'duplicate' }> {
  const existing = await db.query<{ operation_id: string }>(
    'select operation_id from processed_operations where operation_id = ?',
    [command.operationId],
  )
  if (existing.length) return { status: 'duplicate' }
  const assets = await loadAssets(db)
  const employees = await db.query<{ left_at?: string | null }>(
    'select left_at from employees where id = ?',
    [command.employeeId],
  )
  if (!employees.length) throw new Error('직원을 찾을 수 없습니다.')
  applyAssignAsset(assets, command, { leftAt: employees[0].left_at ?? undefined })
  try {
    await db.batch([
      {
        sql: 'insert into processed_operations(operation_id, result_json, created_at) values(?, ?, ?)',
        params: [command.operationId, JSON.stringify({ type: 'assign_asset' }), createdAt],
      },
      {
        sql: 'update assets set status = ?, employee_id = ? where id = ?',
        params: ['assigned', command.employeeId, command.assetId],
      },
      {
        sql: 'insert into audit_events(id, action, detail_json, created_at) values(?, ?, ?, ?)',
        params: [
          `${command.operationId}:audit`,
          'assign_asset',
          JSON.stringify({ assetId: command.assetId, employeeId: command.employeeId }),
          createdAt,
        ],
      },
    ])
    return { status: 'applied' }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/UNIQUE constraint failed/i.test(message)) return { status: 'duplicate' }
    throw error
  }
}

export async function executeReturnAsset(
  db: {
    query: <T>(sql: string, params?: unknown[]) => Promise<T[]>
    batch: (statements: { sql: string; params?: unknown[] }[]) => Promise<void>
  },
  command: { operationId: string; assetId: string },
  createdAt = new Date().toISOString(),
): Promise<{ status: 'applied' | 'duplicate' }> {
  const existing = await db.query<{ operation_id: string }>(
    'select operation_id from processed_operations where operation_id = ?',
    [command.operationId],
  )
  if (existing.length) return { status: 'duplicate' }
  const assets = await loadAssets(db)
  applyReturnAsset(assets, command)
  try {
    await db.batch([
      {
        sql: 'insert into processed_operations(operation_id, result_json, created_at) values(?, ?, ?)',
        params: [command.operationId, JSON.stringify({ type: 'return_asset' }), createdAt],
      },
      {
        sql: 'update assets set status = ?, employee_id = ? where id = ?',
        params: ['in_storage', null, command.assetId],
      },
      {
        sql: 'insert into audit_events(id, action, detail_json, created_at) values(?, ?, ?, ?)',
        params: [
          `${command.operationId}:audit`,
          'return_asset',
          JSON.stringify({ assetId: command.assetId }),
          createdAt,
        ],
      },
    ])
    return { status: 'applied' }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/UNIQUE constraint failed/i.test(message)) return { status: 'duplicate' }
    throw error
  }
}

export async function executeIssueAsset(
  db: {
    query: <T>(sql: string, params?: unknown[]) => Promise<T[]>
    batch: (statements: { sql: string; params?: unknown[] }[]) => Promise<void>
  },
  command: { operationId: string; itemId: string; employeeId: string; warehouseId?: string },
  createdAt = new Date().toISOString(),
): Promise<{ status: 'applied' | 'duplicate' }> {
  const existing = await db.query<{ operation_id: string }>(
    'select operation_id from processed_operations where operation_id = ?',
    [command.operationId],
  )
  if (existing.length) return { status: 'duplicate' }
  const employees = await db.query<{ left_at?: string | null }>(
    'select left_at from employees where id = ?',
    [command.employeeId],
  )
  if (!employees.length) throw new Error('직원을 찾을 수 없습니다.')
  if (employees[0].left_at) throw new Error('퇴사한 직원에게는 지급할 수 없습니다.')
  const assetId = `${command.operationId}:1`
  const warehouseId = command.warehouseId ?? 'wh-main'
  try {
    await db.batch([
      {
        sql: 'insert into processed_operations(operation_id, result_json, created_at) values(?, ?, ?)',
        params: [command.operationId, JSON.stringify({ type: 'issue_asset' }), createdAt],
      },
      {
        sql: `insert into assets(id, item_id, warehouse_id, status, employee_id, source_operation_id, created_at)
          values(?, ?, ?, ?, ?, ?, ?)`,
        params: [
          assetId,
          command.itemId,
          warehouseId,
          'assigned',
          command.employeeId,
          command.operationId,
          createdAt,
        ],
      },
      {
        sql: 'insert into audit_events(id, action, detail_json, created_at) values(?, ?, ?, ?)',
        params: [
          `${command.operationId}:audit`,
          'issue_asset',
          JSON.stringify({ assetId, itemId: command.itemId, employeeId: command.employeeId }),
          createdAt,
        ],
      },
    ])
    return { status: 'applied' }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/UNIQUE constraint failed/i.test(message)) return { status: 'duplicate' }
    throw error
  }
}
