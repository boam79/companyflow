import { isCompanyAssetItem, isSupplyItem, type ItemRecord } from '../master/book'
import { companyOnHand, onHand, orderReceived, orderRejected, orderRemaining, orderSupplierReturned, stockOrderLines, type StockOrder, type StockState } from './engine'

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
  if (!selected || !order || !stockOrderLines(order).some((line) => line.itemId === selected.itemId)) return ''
  return ` · 발주 ${order.id} 잔량 ${remaining}`
}

export type NamedPartner = { id: string; name: string }

export type PurchaseOrderRow = {
  orderId: string
  itemId: string
  itemName: string
  orderedQty: number
  receivedQty: number
  rejectedQty: number
  returnedQty: number
  remainingQty: number
  status: StockOrder['status']
  partnerId?: string
  supplierName: string
  dueDate: string
  orderDate: string
  fileName: string
  currency: string
  currencyName: string
}

export const ORDER_CURRENCIES = [
  { id: 'KRW', name: '원' },
  { id: 'USD', name: '달러' },
] as const

export function orderCurrencyLabel(id?: string): string {
  const code = id?.trim() || 'KRW'
  return ORDER_CURRENCIES.find((row) => row.id === code)?.name ?? code
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
    .flatMap((order) => {
      const partnerId = order.partnerId
      return stockOrderLines(order).flatMap((line) => {
        const item = items.find((row) => row.id === line.itemId)
        if (!match(item)) return []
        return [
          {
            orderId: order.id,
            itemId: line.itemId,
            itemName: item?.name ?? line.itemId,
            orderedQty: line.qty,
            receivedQty: orderReceived(state, order.id, line.itemId),
            rejectedQty: orderRejected(state, order.id, line.itemId),
            returnedQty: orderSupplierReturned(state, order.id, line.itemId),
            remainingQty: orderRemaining(state, order.id, line.itemId),
            status: order.status,
            ...(partnerId ? { partnerId } : {}),
            supplierName: partners.find((row) => row.id === partnerId)?.name ?? '',
            dueDate: order.dueDate ?? '',
            orderDate: order.orderDate ?? '',
            fileName: order.fileName ?? '',
            currency: order.currency || 'KRW',
            currencyName: orderCurrencyLabel(order.currency),
          },
        ]
      })
    })
    .sort((a, b) => a.orderId.localeCompare(b.orderId) || a.itemName.localeCompare(b.itemName, 'ko'))
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

export function todayYmd(now = new Date()): string {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function csvCell(value: string | number) {
  const text = String(value)
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

export function supplyOrderCsv(rows: PurchaseOrderRow[]): string {
  const lines = [
    ['발주번호', '품목', '공급사', '발주일', '납기', '첨부', '통화', '발주', '수령', '불량', '반품', '잔량', '상태'].join(','),
    ...rows.map((row) =>
      [
        csvCell(row.orderId),
        csvCell(row.itemName),
        csvCell(row.supplierName),
        csvCell(row.orderDate),
        csvCell(row.dueDate),
        csvCell(row.fileName),
        csvCell(row.currencyName),
        row.orderedQty,
        row.receivedQty,
        row.rejectedQty,
        row.returnedQty,
        row.remainingQty,
        row.status === 'draft' ? '초안' : '확정',
      ].join(','),
    ),
  ]
  return `\uFEFF${lines.join('\n')}\n`
}
