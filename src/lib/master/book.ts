import { ProcessedOperations, type ProcessResult } from '../idempotency'

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

export function seedDefaultMaster(book: CompanyMasterBook): void {
  book.upsertDepartment(`${book.companyId}:seed:dept-admin`, {
    id: 'dept-admin',
    name: '총무',
  })
  book.upsertWarehouse(`${book.companyId}:seed:wh-main`, {
    id: 'wh-main',
    name: '본사창고',
  })
  book.defineField(`${book.companyId}:seed:field-emp-no`, {
    entity: 'employee',
    key: 'employee_no',
    label: '사원번호',
  })
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
    created_at text not null
  );`,
  `create table if not exists items (
    id text primary key,
    name text not null,
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
