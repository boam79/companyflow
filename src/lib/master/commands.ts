import { normalizeHangulField } from '../asset/life'
import { assertContractFile, bytesToBase64 } from '../contracts/book'

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

export function masterDeactivateStatement(table: string, id: string) {
  assertMasterTable(table)
  if (table === 'employees') {
    throw new Error('직원은 퇴사로 남기고 목록에서 지우지 않습니다.')
  }
  if (!id.trim()) throw new Error('사용 안 함으로 둘 줄을 고르세요.')
  return {
    sql: `update ${table} set active = 0 where id = ?`,
    params: [id],
  }
}

export const ACTIVE_MASTER_WHERE = 'coalesce(active, 1) = 1'

export const PURCHASE_KINDS = [
  { id: 'supply', label: '일반 비품' },
  { id: 'material', label: '자재' },
  { id: 'service', label: '서비스' },
] as const

export type PurchaseKindRow = { id: string; name: string; active?: number | null }

export function assertPurchaseKind(value: string, kinds?: PurchaseKindRow[]) {
  const id = value.trim()
  if (!id) throw new Error('구매 구분을 고르세요.')
  if (!kinds) return
  const row = kinds.find((item) => item.id === id)
  if (!row || row.active === 0) throw new Error('사용 중인 구매 구분만 고르세요.')
}

export function purchaseKindLabel(value?: string | null, kinds?: PurchaseKindRow[]) {
  const id = value || 'supply'
  const custom = kinds?.find((item) => item.id === id)
  if (custom?.name) return custom.name
  return PURCHASE_KINDS.find((item) => item.id === id)?.label ?? id
}

export function assertUniquePurchaseKindName(
  name: string,
  kinds: PurchaseKindRow[],
  kindId?: string,
) {
  const normalized = normalizeHangulField(name)
  if (!normalized) throw new Error('구매 구분 이름을 입력하세요.')
  if (
    kinds.some(
      (row) => row.id !== kindId && row.active !== 0 && normalizeHangulField(row.name) === normalized,
    )
  ) {
    throw new Error('같은 이름의 구매 구분이 있습니다.')
  }
}

export function purchaseKindInsertStatement(row: { id: string; name: string; createdAt: string }) {
  const name = normalizeHangulField(row.name)
  if (!name) throw new Error('구매 구분 이름을 입력하세요.')
  if (!row.id.trim()) throw new Error('구매 구분 아이디가 필요합니다.')
  return {
    sql: 'insert into purchase_kinds(id, name, created_at) values(?, ?, ?)',
    params: [row.id, name, row.createdAt],
  }
}

export function purchaseKindRenameStatement(id: string, name: string) {
  if (!id.trim()) throw new Error('이름을 바꿀 구매 구분을 고르세요.')
  const next = normalizeHangulField(name)
  if (!next) throw new Error('구매 구분 이름을 입력하세요.')
  return {
    sql: 'update purchase_kinds set name = ? where id = ?',
    params: [next, id],
  }
}

export function purchaseKindDeactivateStatement(id: string) {
  if (!id.trim()) throw new Error('사용 안 함으로 둘 구매 구분을 고르세요.')
  return {
    sql: 'update purchase_kinds set active = 0 where id = ?',
    params: [id],
  }
}

export function assertUniqueItemName(
  name: string,
  items: { id: string; name: string }[],
  itemId?: string,
) {
  const normalized = normalizeHangulField(name)
  if (!normalized) throw new Error('품목 이름을 입력하세요.')
  if (items.some((row) => row.id !== itemId && normalizeHangulField(row.name) === normalized)) {
    throw new Error('같은 이름의 품목이 있습니다. 목록에서 고르고 품목 저장하세요.')
  }
}

export function assertUniqueItemCode(
  code: string,
  items: { id: string; code?: string | null }[],
  itemId?: string,
) {
  const normalized = normalizeHangulField(code)
  if (!normalized) return
  const key = normalized.toLowerCase()
  if (
    items.some(
      (row) => row.id !== itemId && normalizeHangulField(row.code ?? '').toLowerCase() === key,
    )
  ) {
    throw new Error('같은 코드의 품목이 있습니다. 코드를 바꾸세요.')
  }
}

export function assertItemSupplier(partnerId: string, partners: { id: string }[]) {
  const id = partnerId.trim()
  if (!id) return
  if (!partners.some((row) => row.id === id)) {
    throw new Error('거래처 목록에 있는 공급사만 고르세요.')
  }
}

export function assertUniquePartnerName(
  name: string,
  partners: { id: string; name: string }[],
  partnerId?: string,
) {
  const normalized = normalizeHangulField(name)
  if (!normalized) throw new Error('거래처 이름을 입력하세요.')
  if (partners.some((row) => row.id !== partnerId && normalizeHangulField(row.name) === normalized)) {
    throw new Error('같은 이름의 거래처가 있습니다. 목록에서 고르고 거래처 저장하세요.')
  }
}

export type ItemCollapseRow = {
  id: string
  name: string
  code?: string | null
  minStock?: number | null
  active?: number | null
}

export function duplicateItemRepairs(rows: ItemCollapseRow[]): {
  deactivateIds: string[]
  minStockUpdates: { id: string; minStock: number }[]
} {
  const groups = new Map<string, ItemCollapseRow[]>()
  for (const row of rows) {
    if (row.active === 0) continue
    const key = normalizeHangulField(row.name)
    if (!key) continue
    const list = groups.get(key) ?? []
    list.push(row)
    groups.set(key, list)
  }
  const deactivateIds: string[] = []
  const minStockUpdates: { id: string; minStock: number }[] = []
  for (const list of groups.values()) {
    if (list.length < 2) continue
    const keeper =
      list.find((row) => row.id === 'item-paper') ??
      list.find((row) => Boolean(normalizeHangulField(row.code ?? ''))) ??
      [...list].sort((a, b) => a.id.localeCompare(b.id))[0]
    const extras = list.filter((row) => row.id !== keeper.id)
    deactivateIds.push(...extras.map((row) => row.id))
    const minStock = Math.max(keeper.minStock ?? 0, ...extras.map((row) => row.minStock ?? 0))
    if (minStock !== (keeper.minStock ?? 0)) {
      minStockUpdates.push({ id: keeper.id, minStock })
    }
  }
  return { deactivateIds, minStockUpdates }
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
    purchaseKind?: string
    partnerId?: string
    kinds?: PurchaseKindRow[]
    phone?: string
    memo?: string
    fileName?: string
    fileMime?: string
    fileBase64?: string
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
      name: row.name,
      code: row.code ?? '',
      unit: row.unit ?? '개',
      minStock: row.minStock ?? 0,
      purchaseKind: row.purchaseKind ?? 'supply',
      partnerId: row.partnerId,
      kinds: row.kinds,
    })
    return {
      sql: 'insert into items(id, name, code, unit, min_stock, purchase_kind, partner_id, created_at) values(?, ?, ?, ?, ?, ?, ?, ?)',
      params: [
        row.id,
        catalog.name,
        catalog.code,
        catalog.unit,
        catalog.minStock,
        catalog.purchaseKind,
        catalog.partnerId,
        row.createdAt,
      ],
    }
  }
  if (table === 'partners') {
    const profile = partnerProfileValues(row)
    return {
      sql: 'insert into partners(id, name, phone, memo, file_name, file_mime, file_base64, created_at) values(?, ?, ?, ?, ?, ?, ?, ?)',
      params: [
        row.id,
        profile.name,
        profile.phone,
        profile.memo,
        row.fileName?.trim() || null,
        row.fileMime || null,
        row.fileBase64 || null,
        row.createdAt,
      ],
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
  name: string
  code: string
  unit: string
  minStock: number
  purchaseKind?: string
  partnerId?: string
  kinds?: PurchaseKindRow[]
}) {
  const catalog = itemCatalogValues(row)
  return {
    sql: 'update items set name = ?, code = ?, unit = ?, min_stock = ?, purchase_kind = ?, partner_id = ? where id = ?',
    params: [
      catalog.name,
      catalog.code,
      catalog.unit,
      catalog.minStock,
      catalog.purchaseKind,
      catalog.partnerId,
      row.id,
    ],
  }
}

function itemCatalogValues(row: {
  id: string
  name: string
  code: string
  unit: string
  minStock: number
  purchaseKind?: string
  partnerId?: string
  kinds?: PurchaseKindRow[]
}) {
  if (!Number.isInteger(row.minStock) || row.minStock < 0) {
    throw new Error('최소재고는 0 이상 정수입니다.')
  }
  const name = normalizeHangulField(row.name)
  if (!name) throw new Error('품목 이름을 입력하세요.')
  const unit = normalizeHangulField(row.unit)
  if (!unit) throw new Error('단위를 입력하세요.')
  const purchaseKind = row.purchaseKind ?? 'supply'
  assertPurchaseKind(purchaseKind, row.kinds)
  const code = normalizeHangulField(row.code)
  const partnerId = row.partnerId?.trim() || null
  return { name, code: code || null, unit, minStock: row.minStock, purchaseKind, partnerId }
}

export function partnerAttachment(file: { name: string; mime?: string; bytes: Uint8Array }) {
  const fileMime = assertContractFile(file.bytes.byteLength, file.mime, file.name, file.bytes)
  return {
    fileName: file.name.trim() || '거래처첨부',
    fileMime,
    fileBase64: bytesToBase64(file.bytes),
  }
}

export function partnerUpdateStatement(row: {
  id: string
  name: string
  phone?: string
  memo?: string
  fileName?: string | null
  fileMime?: string | null
  fileBase64?: string | null
}) {
  const profile = partnerProfileValues(row)
  if (row.fileBase64) {
    return {
      sql: 'update partners set name = ?, phone = ?, memo = ?, file_name = ?, file_mime = ?, file_base64 = ? where id = ?',
      params: [profile.name, profile.phone, profile.memo, row.fileName, row.fileMime, row.fileBase64, row.id],
    }
  }
  return {
    sql: 'update partners set name = ?, phone = ?, memo = ? where id = ?',
    params: [profile.name, profile.phone, profile.memo, row.id],
  }
}

function partnerProfileValues(row: { name: string; phone?: string; memo?: string }) {
  const name = normalizeHangulField(row.name)
  if (!name) throw new Error('거래처 이름을 입력하세요.')
  const phone = normalizeHangulField(row.phone ?? '')
  const memo = normalizeHangulField(row.memo ?? '')
  return { name, phone: phone || null, memo: memo || null }
}
