import { loadAssets, type AssetRecord } from './book'

export const ASSET_EVENT_TABLE_SQL = [
  `create table if not exists asset_events (
    id text primary key,
    asset_id text not null,
    kind text not null,
    happened_at text not null,
    reason text,
    location_text text,
    department_name text,
    owner_name text,
    created_at text not null
  );`,
]

export type AssetLifeKind = 'transfer' | 'repair' | 'dispose'

export type AssetLifeEvent = {
  id: string
  assetId: string
  kind: AssetLifeKind
  happenedAt: string
  reason?: string
  locationText?: string
  departmentName?: string
  ownerName?: string
  createdAt: string
}

export type AssetLifeInput = {
  operationId: string
  assetId: string
  kind: AssetLifeKind
  happenedAt: string
  reason?: string
  locationText?: string
  departmentName?: string
  ownerName?: string
}

const LIFE_LABELS: Record<AssetLifeKind, string> = {
  transfer: '이관',
  repair: '수리',
  dispose: '폐기',
}

export function assetLifeLabel(kind: AssetLifeKind) {
  return LIFE_LABELS[kind]
}

export function normalizeHangulField(raw: string) {
  return raw.normalize('NFC').replace(/\s+/g, ' ').trim()
}

export function readAssetLifeForm(data: FormData): Omit<AssetLifeInput, 'operationId' | 'assetId'> {
  const kind = String(data.get('kind') || 'transfer') as AssetLifeKind
  if (!(kind in LIFE_LABELS)) throw new Error('구분이 올바르지 않습니다.')
  return {
    kind,
    happenedAt: String(data.get('happenedAt') || '').trim(),
    locationText: normalizeHangulField(String(data.get('locationText') ?? '')),
    departmentName: normalizeHangulField(String(data.get('departmentName') ?? '')),
    ownerName: normalizeHangulField(String(data.get('ownerName') ?? '')),
    reason: normalizeHangulField(String(data.get('reason') ?? '')),
  }
}

export function applyAssetLife(assets: AssetRecord[], command: Omit<AssetLifeInput, 'operationId'>): AssetRecord[] {
  const asset = assets.find((row) => row.id === command.assetId)
  if (!asset) throw new Error('자산을 찾을 수 없습니다.')
  if (asset.status === 'disposed') throw new Error('폐기된 자산은 이관·수리할 수 없습니다.')
  if (!command.happenedAt.trim()) throw new Error('발생일이 필요합니다.')
  if (command.kind === 'transfer' && !normalizeHangulField(command.locationText ?? '')) {
    throw new Error('이관할 위치가 필요합니다.')
  }
  return assets.map((row) => {
    if (row.id !== command.assetId) return row
    if (command.kind === 'transfer') {
      return {
        ...row,
        locationText: normalizeHangulField(command.locationText ?? ''),
        departmentName: normalizeHangulField(command.departmentName ?? '') || undefined,
        ownerName: normalizeHangulField(command.ownerName ?? '') || undefined,
        employeeId: undefined,
        status: 'in_storage',
      }
    }
    if (command.kind === 'dispose') {
      return { ...row, status: 'disposed' as const, employeeId: undefined }
    }
    return row
  })
}

export async function loadAssetEvents(
  db: { query: <T>(sql: string, params?: unknown[]) => Promise<T[]> },
  assetId: string,
): Promise<AssetLifeEvent[]> {
  const rows = await db.query<{
    id: string
    asset_id: string
    kind: AssetLifeKind
    happened_at: string
    reason?: string | null
    location_text?: string | null
    department_name?: string | null
    owner_name?: string | null
    created_at: string
  }>(
    `select id, asset_id, kind, happened_at, reason, location_text, department_name, owner_name, created_at
      from asset_events where asset_id = ? order by happened_at, created_at, id`,
    [assetId],
  )
  return rows.map((row) => ({
    id: row.id,
    assetId: row.asset_id,
    kind: row.kind,
    happenedAt: row.happened_at,
    reason: row.reason ?? undefined,
    locationText: row.location_text ?? undefined,
    departmentName: row.department_name ?? undefined,
    ownerName: row.owner_name ?? undefined,
    createdAt: row.created_at,
  }))
}

export async function executeAssetLife(
  db: {
    query: <T>(sql: string, params?: unknown[]) => Promise<T[]>
    batch: (statements: { sql: string; params?: unknown[] }[]) => Promise<void>
  },
  command: AssetLifeInput,
  createdAt = new Date().toISOString(),
): Promise<{ status: 'applied' | 'duplicate' }> {
  const existing = await db.query<{ operation_id: string }>(
    'select operation_id from processed_operations where operation_id = ?',
    [command.operationId],
  )
  if (existing.length) return { status: 'duplicate' }
  const assets = await loadAssets(db)
  const next = applyAssetLife(assets, command).find((row) => row.id === command.assetId)
  if (!next) throw new Error('자산을 찾을 수 없습니다.')
  try {
    await db.batch([
      {
        sql: 'insert into processed_operations(operation_id, result_json, created_at) values(?, ?, ?)',
        params: [command.operationId, JSON.stringify({ type: 'asset_life', kind: command.kind }), createdAt],
      },
      {
        sql: 'update assets set location_text = ?, department_name = ?, owner_name = ?, status = ? where id = ?',
        params: [
          next.locationText ?? null,
          next.departmentName ?? null,
          next.ownerName ?? null,
          next.status,
          command.assetId,
        ],
      },
      {
        sql: `insert into asset_events(id, asset_id, kind, happened_at, reason, location_text, department_name, owner_name, created_at)
          values(?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [
          command.operationId,
          command.assetId,
          command.kind,
          command.happenedAt,
          command.reason?.trim() || null,
          command.kind === 'transfer' ? next.locationText ?? null : command.locationText?.trim() || null,
          command.kind === 'transfer' ? next.departmentName ?? null : command.departmentName?.trim() || null,
          command.kind === 'transfer' ? next.ownerName ?? null : command.ownerName?.trim() || null,
          createdAt,
        ],
      },
      {
        sql: 'insert into audit_events(id, action, detail_json, created_at) values(?, ?, ?, ?)',
        params: [
          `${command.operationId}:audit`,
          'asset_life',
          JSON.stringify({ assetId: command.assetId, kind: command.kind }),
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
