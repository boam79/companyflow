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
  row: { id: string; name: string; createdAt: string; departmentId?: string },
): { sql: string; params: unknown[] } {
  assertMasterTable(table)
  if (table === 'employees') {
    return {
      sql: 'insert into employees(id, name, department_id, created_at) values(?, ?, ?, ?)',
      params: [row.id, row.name, row.departmentId ?? null, row.createdAt],
    }
  }
  return {
    sql: `insert into ${table}(id, name, created_at) values(?, ?, ?)`,
    params: [row.id, row.name, row.createdAt],
  }
}
