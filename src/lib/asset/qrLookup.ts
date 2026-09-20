import { assetNumber, loadAssets, type AssetRecord } from './book'
import { assetLifeLabel, loadAssetEvents, type AssetLifeEvent } from './life'
import { assertLabelId } from './qr'

export type QrAssetDetail = {
  assetId: string
  assetNumber: string
  itemName: string
  model?: string
  serialNo?: string
  locationText?: string
  departmentName?: string
  ownerName?: string
  acquiredAt?: string
  statusLabel: string
  history: string[]
}

export function findAssetByQrToken(assets: AssetRecord[], token: string): AssetRecord | undefined {
  const id = assertLabelId(token)
  return assets.find((row) => row.qrToken === id)
}

export function qrHistoryLine(event: AssetLifeEvent) {
  return [assetLifeLabel(event.kind), event.happenedAt, event.locationText, event.reason]
    .filter(Boolean)
    .join(' · ')
}

export function buildQrAssetDetail(
  asset: AssetRecord,
  items: { id: string; name: string }[],
  events: AssetLifeEvent[],
): QrAssetDetail {
  return {
    assetId: asset.id,
    assetNumber: assetNumber(asset.id, asset.serialNo),
    itemName: items.find((item) => item.id === asset.itemId)?.name ?? asset.itemId,
    model: asset.model,
    serialNo: asset.serialNo,
    locationText: asset.locationText,
    departmentName: asset.departmentName,
    ownerName: asset.ownerName,
    acquiredAt: asset.acquiredAt,
    statusLabel: asset.status === 'disposed' ? '폐기' : '사용',
    history: events.map(qrHistoryLine),
  }
}

export function phoneQrSavedMessage() {
  return '이미 저장된 QR입니다. 지정 PC에서 이 QR을 읽으면 상세와 이력이 보입니다.'
}

export async function loadQrAssetDetail(
  db: { query: <T>(sql: string, params?: unknown[]) => Promise<T[]> },
  token: string,
  items: { id: string; name: string }[],
): Promise<QrAssetDetail | null> {
  const assets = await loadAssets(db)
  const asset = findAssetByQrToken(assets, token)
  if (!asset) return null
  const events = await loadAssetEvents(db, asset.id)
  return buildQrAssetDetail(asset, items, events)
}
