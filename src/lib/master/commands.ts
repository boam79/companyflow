import { normalizeHangulField } from '../asset/life'

export const MASTER_TABLES = [
  'departments',
  'employees',
  'items',
  'partners',
  'warehouses',
] as const

export type MasterTable = (typeof MASTER_TABLES)[number]

export type MasterFieldEntity = 'department' | 'employee' | 'item' | 'partner' | 'warehouse'

const TABLE_ENTITY: Record<MasterTable, MasterFieldEntity> = {
  departments: 'department',
  employees: 'employee',
  items: 'item',
  partners: 'partner',
  warehouses: 'warehouse',
}

export function assertMasterTable(table: string): asserts table is MasterTable {
  if (!(MASTER_TABLES as readonly string[]).includes(table)) {
    throw new Error('허용되지 않은 기준정보 테이블입니다.')
  }
}

export function fieldEntityFromTable(table: MasterTable): MasterFieldEntity {
  return TABLE_ENTITY[table]
}

export function masterInsertStatement(
  table: string,
  row: {
    id: string
    name: string
    createdAt: string
    departmentId?: string
    minStock?: number
    code?: string
    unit?: string
  },
): { sql: string; params: unknown[] } {
  assertMasterTable(table)
  if (table === 'employees') {
    return {
      sql: 'insert into employees(id, name, department_id, created_at) values(?, ?, ?, ?)',
      params: [row.id, row.name, row.departmentId ?? null, row.createdAt],
    }
  }
  if (table === 'items') {
    const catalog = itemCatalogValues({
      id: row.id,
      code: row.code ?? '',
      unit: row.unit ?? '개',
      minStock: row.minStock ?? 0,
    })
    return {
      sql: 'insert into items(id, name, code, unit, min_stock, created_at) values(?, ?, ?, ?, ?, ?)',
      params: [row.id, row.name, catalog.code, catalog.unit, catalog.minStock, row.createdAt],
    }
  }
  return {
    sql: `insert into ${table}(id, name, created_at) values(?, ?, ?)`,
    params: [row.id, row.name, row.createdAt],
  }
}

export function minStockUpdateStatement(itemId: string, minStock: number) {
  if (!Number.isInteger(minStock) || minStock < 0) {
    throw new Error('최소재고는 0 이상 정수입니다.')
  }
  return {
    sql: 'update items set min_stock = ? where id = ?',
    params: [minStock, itemId],
  }
}

export function itemCatalogUpdateStatement(row: {
  id: string
  code: string
  unit: string
  minStock: number
}) {
  const catalog = itemCatalogValues(row)
  return {
    sql: 'update items set code = ?, unit = ?, min_stock = ? where id = ?',
    params: [catalog.code, catalog.unit, catalog.minStock, row.id],
  }
}

function itemCatalogValues(row: { id: string; code: string; unit: string; minStock: number }) {
  if (!Number.isInteger(row.minStock) || row.minStock < 0) {
    throw new Error('최소재고는 0 이상 정수입니다.')
  }
  const unit = normalizeHangulField(row.unit)
  if (!unit) throw new Error('단위를 입력하세요.')
  const code = normalizeHangulField(row.code)
  return { code: code || null, unit, minStock: row.minStock }
}
