import { isCompanyAssetItem, isSupplyItem, type ItemRecord } from '../master/book'
import { companyOnHand, onHand, orderReceived, orderRemaining, type StockOrder, type StockState } from './engine'

export type NamedWarehouse = { id: string; name: string }

export type SupplyInventoryRow = {
  itemId: string
  itemName: string
  quantities: number[]
  total: number
}

export function supplyItems(items: ItemRecord[]): ItemRecord[] {
  return items.filter(isSupplyItem)
}

export function buildSupplyInventory(
  items: ItemRecord[],
  warehouses: NamedWarehouse[],
  state: StockState,
): SupplyInventoryRow[] {
  return supplyItems(items).map((item) => ({
    itemId: item.id,
    itemName: item.name,
    quantities: warehouses.map((warehouse) => onHand(state, item.id, warehouse.id)),
    total: companyOnHand(state, item.id),
  }))
}

export function orderRemainingCaption(
  selected: Pick<SupplyInventoryRow, 'itemId'> | undefined,
  order: StockOrder | undefined,
  remaining: number,
): string {
  if (!selected || !order || order.itemId !== selected.itemId) return ''
  return ` · 발주 ${order.id} 잔량 ${remaining}`
}

export type NamedPartner = { id: string; name: string }

export type PurchaseOrderRow = {
  orderId: string
  itemId: string
  itemName: string
  orderedQty: number
  receivedQty: number
  remainingQty: number
  status: StockOrder['status']
  partnerId?: string
  supplierName: string
}

export function resolveOrderPartnerId(
  selected: string | undefined,
  item?: Pick<ItemRecord, 'partnerId'>,
): string | undefined {
  const picked = selected?.trim()
  if (picked) return picked
  return item?.partnerId || undefined
}

function orderRows(
  items: ItemRecord[],
  state: StockState,
  match: (item?: ItemRecord) => boolean,
  partners: NamedPartner[] = [],
): PurchaseOrderRow[] {
  return [...state.orders.values()]
    .filter((order) => match(items.find((item) => item.id === order.itemId)))
    .map((order) => {
      const item = items.find((row) => row.id === order.itemId)
      const partnerId = order.partnerId
      return {
        orderId: order.id,
        itemId: order.itemId,
        itemName: item?.name ?? order.itemId,
        orderedQty: order.qty,
        receivedQty: orderReceived(state, order.id),
        remainingQty: orderRemaining(state, order.id),
        status: order.status,
        ...(partnerId ? { partnerId } : {}),
        supplierName: partners.find((row) => row.id === partnerId)?.name ?? '',
      }
    })
    .sort((a, b) => a.orderId.localeCompare(b.orderId))
}

export function buildSupplyOrderList(
  items: ItemRecord[],
  state: StockState,
  partners: NamedPartner[] = [],
): PurchaseOrderRow[] {
  return orderRows(items, state, isSupplyItem, partners)
}

export function buildAssetOrderList(
  items: ItemRecord[],
  state: StockState,
  partners: NamedPartner[] = [],
): PurchaseOrderRow[] {
  return orderRows(items, state, isCompanyAssetItem, partners)
}

function csvCell(value: string | number) {
  const text = String(value)
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

export function supplyOrderCsv(rows: PurchaseOrderRow[]): string {
  const lines = [
    ['발주번호', '품목', '공급사', '발주', '수령', '잔량', '상태'].join(','),
    ...rows.map((row) =>
      [
        csvCell(row.orderId),
        csvCell(row.itemName),
        csvCell(row.supplierName),
        row.orderedQty,
        row.receivedQty,
        row.remainingQty,
        row.status === 'draft' ? '초안' : '확정',
      ].join(','),
    ),
  ]
  return `\uFEFF${lines.join('\n')}\n`
}
