import { ISSUE_ITEMS, isCompanyAssetItem, isSupplyItem, type ItemRecord } from '../master/book'
import { assetsFromConvert, type AssetRecord } from './book'

export type ReceiptAllocation = {
  warehouseQty: number
  assetQty: number
}

export function allocateReceiptQty(item: ItemRecord | undefined, qty: number): ReceiptAllocation {
  if (!Number.isInteger(qty) || qty < 1) throw new Error('수량은 1 이상의 정수여야 합니다.')
  if (!item) throw new Error('품목이 필요합니다.')
  if (ISSUE_ITEMS.some((row) => row.id === item.id)) {
    throw new Error('명찰·유니폼·노트북은 입퇴사에서 지급합니다. 수령으로 자산화하지 않습니다.')
  }
  if (isCompanyAssetItem(item)) return { warehouseQty: 0, assetQty: qty }
  if (isSupplyItem(item)) return { warehouseQty: qty, assetQty: 0 }
  throw new Error('이 품목은 수령 배분할 수 없습니다.')
}

export function assetsFromReceipt(
  operationId: string,
  itemId: string,
  warehouseId: string,
  qty: number,
  createdAt: string,
  orderId: string,
): AssetRecord[] {
  const acquiredAt = createdAt.slice(0, 10)
  return assetsFromConvert(operationId, itemId, warehouseId, qty, createdAt).map((asset) => ({
    ...asset,
    locationText: '수령',
    acquiredAt,
    sourceOrderId: orderId,
  }))
}
