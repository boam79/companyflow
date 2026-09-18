import { ProcessedOperations, type ProcessResult } from '../idempotency'
import type { AssetRecord } from '../asset/book'

export type MasterEntity = 'department' | 'employee' | 'item' | 'partner' | 'warehouse'

export type CustomFieldDef = {
  entity: MasterEntity
  key: string
  label: string
}

export type NamedRecord = {
  id: string
  name: string
}

export type ItemRecord = {
  id: string
  name: string
  stockManaged: boolean
  assetManaged: boolean
}

export const PAPER_ITEM: ItemRecord = {
  id: 'item-paper',
  name: '복사용지',
  stockManaged: true,
  assetManaged: false,
}

export const ISSUE_ITEMS: ItemRecord[] = [
  { id: 'item-badge', name: '명찰', stockManaged: false, assetManaged: true },
  { id: 'item-uniform', name: '유니폼', stockManaged: true, assetManaged: true },
  { id: 'item-laptop', name: '노트북', stockManaged: true, assetManaged: true },
]

export function heldIssuedAssets(
  assets: AssetRecord[],
  employeeId: string,
  items: ItemRecord[],
): AssetRecord[] {
  const issueIds = new Set(items.filter((item) => item.assetManaged).map((item) => item.id))
  return assets.filter(
    (asset) => asset.status === 'assigned' && asset.employeeId === employeeId && issueIds.has(asset.itemId),
  )
}

export function assertConvertibleItem(item: ItemRecord | undefined): ItemRecord {
  if (item && ISSUE_ITEMS.some((row) => row.id === item.id)) {
    throw new Error('명찰·유니폼·노트북은 자산이 아닙니다. 입퇴사 프로세스에서 지급·회수하세요.')
  }
  if (!item?.assetManaged) {
    throw new Error(`${item?.name ?? '이 품목'}은 비품 재고입니다. 책상·컴퓨터처럼 자산관리 품목만 자산화하세요.`)
  }
  return item
}

export function isCompanyAssetItem(item?: ItemRecord) {
  return Boolean(item?.assetManaged) && !ISSUE_ITEMS.some((row) => row.id === item?.id)
}

export function isSupplyItem(item?: ItemRecord) {
  return Boolean(item?.stockManaged) && !item?.assetManaged
}

export function heldCompanyAssets(
  assets: AssetRecord[],
  employeeId: string,
  items: ItemRecord[],
): AssetRecord[] {
  return assets.filter(
    (asset) =>
      asset.status === 'assigned' &&
      asset.employeeId === employeeId &&
      isCompanyAssetItem(items.find((item) => item.id === asset.itemId)),
  )
}

export function assertAssignableCompanyAsset(item?: ItemRecord): ItemRecord {
  if (!item || !isCompanyAssetItem(item)) {
    throw new Error('책상·컴퓨터만 직원에게 배정합니다.')
  }
  return item
}

export function assertCompanyAssetsReturned(
  _assets: AssetRecord[],
  _employeeId: string,
  _items: ItemRecord[],
): void {
  // 책상·컴퓨터는 위치·QR 원본이지 직원 지급품이 아니다. 퇴사를 막지 않는다.
}

export const COMPANY_ASSET_ITEMS: ItemRecord[] = [
  { id: 'item-desk', name: '책상', stockManaged: false, assetManaged: true },
  { id: 'item-chair', name: '의자', stockManaged: false, assetManaged: true },
  { id: 'item-table', name: '회의탁자', stockManaged: false, assetManaged: true },
  { id: 'item-cabinet', name: '서랍장', stockManaged: false, assetManaged: true },
  { id: 'item-computer', name: '컴퓨터', stockManaged: false, assetManaged: true },
  { id: 'item-monitor', name: '모니터', stockManaged: false, assetManaged: true },
  { id: 'item-printer', name: '복합기', stockManaged: false, assetManaged: true },
]

export class CompanyMasterBook {
  readonly departments = new Map<string, NamedRecord>()
  readonly employees = new Map<string, NamedRecord>()
  readonly items = new Map<string, NamedRecord>()
  readonly partners = new Map<string, NamedRecord>()
  readonly warehouses = new Map<string, NamedRecord>()
  readonly fields = new Map<string, CustomFieldDef>()
  private readonly ops = new ProcessedOperations()

  constructor(readonly companyId: string) {}

  fieldLabel(entity: MasterEntity, key: string): string | undefined {
    return this.fields.get(`${entity}:${key}`)?.label
  }

  defineField(
    operationId: string,
    def: CustomFieldDef,
  ): { status: ProcessResult; value: CustomFieldDef } {
    return this.ops.run(operationId, () => {
      this.fields.set(`${def.entity}:${def.key}`, def)
      return def
    })
  }

  upsertDepartment(operationId: string, row: NamedRecord) {
    return this.ops.run(operationId, () => {
      this.departments.set(row.id, row)
      return row
    })
  }

  upsertEmployee(operationId: string, row: NamedRecord) {
    return this.ops.run(operationId, () => {
      this.employees.set(row.id, row)
      return row
    })
  }

  upsertItem(operationId: string, row: NamedRecord) {
    return this.ops.run(operationId, () => {
      this.items.set(row.id, row)
      return row
    })
  }

  upsertPartner(operationId: string, row: NamedRecord) {
    return this.ops.run(operationId, () => {
      this.partners.set(row.id, row)
      return row
    })
  }

  upsertWarehouse(operationId: string, row: NamedRecord) {
    return this.ops.run(operationId, () => {
      this.warehouses.set(row.id, row)
      return row
    })
  }
}

export const DEFAULT_EMPLOYEE = {
  id: 'emp-kim',
  name: '김담당',
  departmentId: 'dept-admin',
  title: '주임',
}

export function seedDefaultMaster(book: CompanyMasterBook): void {
  book.upsertDepartment(`${book.companyId}:seed:dept-admin`, {
    id: 'dept-admin',
    name: '총무',
  })
  book.upsertWarehouse(`${book.companyId}:seed:wh-main`, {
    id: 'wh-main',
    name: '본사창고',
  })
  book.upsertWarehouse(`${book.companyId}:seed:wh-sub`, {
    id: 'wh-sub',
    name: '부속창고',
  })
  book.upsertItem(`${book.companyId}:seed:item-paper`, {
    id: PAPER_ITEM.id,
    name: PAPER_ITEM.name,
  })
  book.upsertEmployee(`${book.companyId}:seed:emp-kim`, {
    id: DEFAULT_EMPLOYEE.id,
    name: DEFAULT_EMPLOYEE.name,
  })
  book.defineField(`${book.companyId}:seed:field-emp-no`, {
    entity: 'employee',
    key: 'employee_no',
    label: '사원번호',
  })
}

export async function writeDefaultMaster(db: {
  exec: (sql: string, params?: unknown[]) => Promise<void>
}): Promise<void> {
  const now = new Date().toISOString()
  await db.exec('insert or ignore into departments(id, name, created_at) values(?, ?, ?)', [
    'dept-admin',
    '총무',
    now,
  ])
  await db.exec('insert or ignore into warehouses(id, name, created_at) values(?, ?, ?)', [
    'wh-main',
    '본사창고',
    now,
  ])
  await db.exec('insert or ignore into warehouses(id, name, created_at) values(?, ?, ?)', [
    'wh-sub',
    '부속창고',
    now,
  ])
  await db.exec(
    'insert or ignore into items(id, name, stock_managed, asset_managed, created_at) values(?, ?, ?, ?, ?)',
    [PAPER_ITEM.id, PAPER_ITEM.name, 1, 0, now],
  )
  await db.exec('update items set stock_managed = 1, asset_managed = 0 where id = ?', [PAPER_ITEM.id])
  for (const item of COMPANY_ASSET_ITEMS) {
    await db.exec(
      'insert or ignore into items(id, name, stock_managed, asset_managed, created_at) values(?, ?, ?, ?, ?)',
      [item.id, item.name, item.stockManaged ? 1 : 0, 1, now],
    )
    await db.exec('update items set stock_managed = ?, asset_managed = 1, name = ? where id = ?', [
      item.stockManaged ? 1 : 0,
      item.name,
      item.id,
    ])
  }
  await db.exec(`delete from items where id in ('item-badge', 'item-uniform', 'item-laptop')`)
  const { writeSampleCompanyData } = await import('./sample')
  await writeSampleCompanyData(db)
  await db.exec(
    `insert or ignore into employees(id, name, department_id, title, hired_at, badge_name, created_at)
      values(?, ?, ?, ?, ?, ?, ?)`,
    [
      DEFAULT_EMPLOYEE.id,
      DEFAULT_EMPLOYEE.name,
      DEFAULT_EMPLOYEE.departmentId,
      DEFAULT_EMPLOYEE.title,
      now.slice(0, 10),
      DEFAULT_EMPLOYEE.name,
      now,
    ],
  )
}

export async function loadItems(
  db: { query: <T>(sql: string, params?: unknown[]) => Promise<T[]> },
): Promise<ItemRecord[]> {
  const rows = await db.query<{
    id: string
    name: string
    stock_managed?: number | null
    asset_managed?: number | null
  }>('select id, name, stock_managed, asset_managed from items order by name')
  return rows
    .filter((row) => !ISSUE_ITEMS.some((item) => item.id === row.id))
    .map((row) => ({
      id: row.id,
      name: row.name,
      stockManaged: row.stock_managed !== 0,
      assetManaged: row.asset_managed === 1,
    }))
}

export const MASTER_TABLE_SQL = [
  `create table if not exists departments (
    id text primary key,
    name text not null,
    created_at text not null
  );`,
  `create table if not exists employees (
    id text primary key,
    name text not null,
    department_id text,
    title text,
    hired_at text,
    left_at text,
    badge_name text,
    badge_department text,
    created_at text not null
  );`,
  `create table if not exists employment_events (
    id text primary key,
    employee_id text not null,
    kind text not null,
    occurred_at text not null,
    detail_json text not null,
    created_at text not null
  );`,
  `create table if not exists employment_checks (
    employee_id text not null,
    item_key text not null,
    issued integer not null default 0,
    issued_at text,
    returned_at text,
    updated_at text not null,
    primary key (employee_id, item_key)
  );`,
  `create table if not exists items (
    id text primary key,
    name text not null,
    stock_managed integer not null default 1,
    asset_managed integer not null default 0,
    created_at text not null
  );`,
  `create table if not exists partners (
    id text primary key,
    name text not null,
    created_at text not null
  );`,
  `create table if not exists warehouses (
    id text primary key,
    name text not null,
    created_at text not null
  );`,
  `create table if not exists custom_field_defs (
    entity text not null,
    key text not null,
    label text not null,
    primary key (entity, key)
  );`,
]
