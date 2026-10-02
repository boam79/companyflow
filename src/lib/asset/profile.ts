import { normalizeHangulField } from './life'

export type AssetProfile = {
  model: string
  serialNo: string
  locationText: string
  departmentName: string
  ownerName: string
  acquiredAt: string
}

export function assertAssetAcquiredAt(value: string) {
  const text = value.trim()
  if (!text) return ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error('취득일은 날짜로 넣으세요.')
  return text
}

export function readAssetProfile(input: {
  model?: string
  serialNo?: string
  locationText?: string
  departmentName?: string
  ownerName?: string
  acquiredAt?: string
}): AssetProfile {
  return {
    model: normalizeHangulField(input.model ?? ''),
    serialNo: normalizeHangulField(input.serialNo ?? ''),
    locationText: normalizeHangulField(input.locationText ?? ''),
    departmentName: normalizeHangulField(input.departmentName ?? ''),
    ownerName: normalizeHangulField(input.ownerName ?? ''),
    acquiredAt: assertAssetAcquiredAt(input.acquiredAt ?? ''),
  }
}

export function assetProfileSavedNotice() {
  return '자산 정보를 저장했습니다. 직원에게 배정하지 않았습니다.'
}

export function assetProfileStatements(assetId: string, profile: AssetProfile) {
  if (!assetId.trim()) throw new Error('자산을 고르세요.')
  return [
    {
      sql: 'update assets set model = ?, serial_no = ?, location_text = ?, department_name = ?, owner_name = ?, acquired_at = ? where id = ?',
      params: [
        profile.model || null,
        profile.serialNo || null,
        profile.locationText || null,
        profile.departmentName || null,
        profile.ownerName || null,
        profile.acquiredAt || null,
        assetId,
      ],
    },
  ]
}

export async function executeAssetProfile(
  db: { batch: (statements: { sql: string; params?: unknown[] }[]) => Promise<void> },
  assetId: string,
  input: Parameters<typeof readAssetProfile>[0],
) {
  await db.batch(assetProfileStatements(assetId, readAssetProfile(input)))
}
