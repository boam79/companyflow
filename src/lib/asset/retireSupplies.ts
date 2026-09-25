import { isCompanyAssetItem, loadItems } from '../master/book'

export async function retireSupplyAssets(db: {
  query: <T>(sql: string, params?: unknown[]) => Promise<T[]>
  exec: (sql: string, params?: unknown[]) => Promise<void>
}): Promise<number> {
  const items = await loadItems(db)
  const supplyIds = new Set(items.filter((item) => !isCompanyAssetItem(item)).map((item) => item.id))
  const assets = await db.query<{ id: string; item_id: string; warehouse_id: string }>(
    'select id, item_id, warehouse_id from assets',
  )
  const supplies = assets.filter((row) => supplyIds.has(row.item_id))
  if (!supplies.length) return 0

  const counts = new Map<string, { itemId: string; warehouseId: string; qty: number }>()
  for (const row of supplies) {
    const key = `${row.item_id}\t${row.warehouse_id}`
    const prev = counts.get(key)
    if (prev) prev.qty += 1
    else counts.set(key, { itemId: row.item_id, warehouseId: row.warehouse_id, qty: 1 })
  }

  const now = new Date().toISOString()
  for (const group of counts.values()) {
    const operationId = `retire-supply:${group.itemId}:${group.warehouseId}`
    const seen = await db.query<{ operation_id: string }>(
      'select operation_id from processed_operations where operation_id = ?',
      [operationId],
    )
    if (seen.length) continue
    await db.exec(
      'insert into processed_operations(operation_id, result_json, created_at) values(?, ?, ?)',
      [operationId, JSON.stringify({ type: 'retire_supply_asset', qty: group.qty }), now],
    )
    await db.exec(
      `insert into stock_ledger(
        id, operation_id, txn_type, item_id, warehouse_id, qty_delta,
        person_name, department_id, source_operation_id, order_id, reason, created_at
      ) values(?, ?, 'direct_in', ?, ?, ?, null, null, null, null, ?, ?)`,
      [
        `${operationId}:direct`,
        operationId,
        group.itemId,
        group.warehouseId,
        group.qty,
        '비품은 자산이 아니라 재고로 되돌림',
        now,
      ],
    )
  }

  const placeholders = [...new Set(supplies.map((row) => row.item_id))].map(() => '?').join(', ')
  await db.exec(
    `delete from assets where item_id in (${placeholders})`,
    [...new Set(supplies.map((row) => row.item_id))],
  )
  return supplies.length
}
