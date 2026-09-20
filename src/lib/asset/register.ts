import { COMPANY_ASSET_ITEMS } from '../master/book'
import { assetNumber, loadAssets, type AssetRecord } from './book'
import { normalizeHangulField } from './life'

export const QR_LABEL_TABLE_SQL = [
  `create table if not exists qr_labels (
    id text primary key,
    status text not null,
    created_at text not null,
    asset_id text
  );`,
]

export type QrLabel = {
  id: string
  status: 'blank' | 'bound'
  createdAt: string
  assetId?: string
}

export type QrAssetPayload = {
  itemName: string
  model: string
  serialNo: string
  location: string
  departmentName: string
  ownerName: string
  acquiredAt: string
}

export function itemIdForQrName(itemName: string) {
  const hit = COMPANY_ASSET_ITEMS.find((item) => item.name === itemName.trim())
  if (!hit) throw new Error('회사 자산 품목만 등록합니다.')
  return hit.id
}

export function assertQrAssetPayload(input: Partial<QrAssetPayload>): QrAssetPayload {
  const itemName = normalizeHangulField(input.itemName ?? '')
  itemIdForQrName(itemName)
  const location = normalizeHangulField(input.location ?? '')
  if (!location) throw new Error('위치를 입력하세요.')
  return {
    itemName,
    model: normalizeHangulField(input.model ?? ''),
    serialNo: normalizeHangulField(input.serialNo ?? ''),
    location,
    departmentName: normalizeHangulField(input.departmentName ?? ''),
    ownerName: normalizeHangulField(input.ownerName ?? ''),
    acquiredAt: input.acquiredAt?.trim() ?? '',
  }
}

export function readQrAssetForm(data: FormData): QrAssetPayload {
  return assertQrAssetPayload({
    itemName: String(data.get('itemName') ?? ''),
    model: String(data.get('model') ?? ''),
    serialNo: String(data.get('serialNo') ?? ''),
    location: String(data.get('location') ?? ''),
    departmentName: String(data.get('departmentName') ?? ''),
    ownerName: String(data.get('ownerName') ?? ''),
    acquiredAt: String(data.get('acquiredAt') ?? ''),
  })
}

export function applyQrRegistration(
  assets: AssetRecord[],
  labels: QrLabel[],
  command: {
    operationId: string
    labelId: string
    payload: QrAssetPayload
    warehouseId?: string
    createdAt: string
  },
): { assets: AssetRecord[]; labels: QrLabel[]; asset: AssetRecord } {
  const payload = assertQrAssetPayload(command.payload)
  const label = labels.find((row) => row.id === command.labelId)
  if (!label) throw new Error('이 QR은 빈 QR이 아닙니다.')
  if (label.status !== 'blank') throw new Error('이미 저장된 QR입니다.')
  if (assets.some((row) => row.qrToken === command.labelId)) {
    throw new Error('이미 저장된 QR입니다.')
  }
  const asset: AssetRecord = {
    id: `${command.labelId}:1`,
    itemId: itemIdForQrName(payload.itemName),
    warehouseId: command.warehouseId ?? 'wh-main',
    status: 'in_storage',
    sourceOperationId: command.operationId,
    createdAt: command.createdAt,
    qrToken: command.labelId,
    model: payload.model || undefined,
    serialNo: payload.serialNo || undefined,
    locationText: payload.location,
    departmentName: payload.departmentName || undefined,
    ownerName: payload.ownerName || undefined,
    acquiredAt: payload.acquiredAt || undefined,
  }
  return {
    asset,
    assets: [...assets, asset],
    labels: labels.map((row) =>
      row.id === command.labelId ? { ...row, status: 'bound' as const, assetId: asset.id } : row,
    ),
  }
}

type AssetDb = {
  query: <T>(sql: string, params?: unknown[]) => Promise<T[]>
  batch: (statements: { sql: string; params?: unknown[] }[]) => Promise<void>
}

export async function loadQrLabels(db: AssetDb): Promise<QrLabel[]> {
  const rows = await db.query<{
    id: string
    status: 'blank' | 'bound'
    created_at: string
    asset_id?: string | null
  }>('select id, status, created_at, asset_id from qr_labels order by created_at, id')
  return rows.map((row) => ({
    id: row.id,
    status: row.status,
    createdAt: row.created_at,
    assetId: row.asset_id ?? undefined,
  }))
}

export function qrBindOperationId(labelId: string) {
  return `qr-bind:${labelId}`
}

export async function executeQrRegistration(
  db: AssetDb,
  command: {
    labelId: string
    payload: QrAssetPayload
    warehouseId?: string
  },
  createdAt = new Date().toISOString(),
): Promise<{ status: 'applied' | 'duplicate'; assetNumber?: string }> {
  const operationId = qrBindOperationId(command.labelId)
  const existing = await db.query<{ operation_id: string }>(
    'select operation_id from processed_operations where operation_id = ?',
    [operationId],
  )
  if (existing.length) return { status: 'duplicate' }
  const [assets, labels] = await Promise.all([loadAssets(db), loadQrLabels(db)])
  const nextLabels =
    labels.some((row) => row.id === command.labelId)
      ? labels
      : [...labels, { id: command.labelId, status: 'blank' as const, createdAt }]
  const applied = applyQrRegistration(assets, nextLabels, {
    operationId,
    labelId: command.labelId,
    payload: command.payload,
    warehouseId: command.warehouseId,
    createdAt,
  })
  try {
    await db.batch([
      {
        sql: 'insert into processed_operations(operation_id, result_json, created_at) values(?, ?, ?)',
        params: [operationId, JSON.stringify({ type: 'qr_register', assetId: applied.asset.id }), createdAt],
      },
      {
        sql: `insert into qr_labels(id, status, created_at, asset_id) values(?, ?, ?, ?)
          on conflict(id) do update set status = excluded.status, asset_id = excluded.asset_id`,
        params: [command.labelId, 'bound', createdAt, applied.asset.id],
      },
      {
        sql: `insert into assets(
            id, item_id, warehouse_id, status, employee_id, source_operation_id, created_at,
            qr_token, model, serial_no, location_text, department_name, owner_name, acquired_at
          ) values(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [
          applied.asset.id,
          applied.asset.itemId,
          applied.asset.warehouseId,
          applied.asset.status,
          null,
          operationId,
          createdAt,
          applied.asset.qrToken,
          applied.asset.model ?? null,
          applied.asset.serialNo ?? null,
          applied.asset.locationText ?? null,
          applied.asset.departmentName ?? null,
          applied.asset.ownerName ?? null,
          applied.asset.acquiredAt ?? null,
        ],
      },
      {
        sql: 'insert into audit_events(id, action, detail_json, created_at) values(?, ?, ?, ?)',
        params: [
          `${operationId}:audit`,
          'qr_register',
          JSON.stringify({ assetId: applied.asset.id, labelId: command.labelId }),
          createdAt,
        ],
      },
    ])
    return { status: 'applied', assetNumber: assetNumber(applied.asset.id) }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/UNIQUE constraint failed/i.test(message)) return { status: 'duplicate' }
    throw error
  }
}
