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
