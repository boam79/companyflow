import { isCompanyAssetItem, isSupplyItem, type ItemRecord } from '../master/book'
import { companyOnHand, onHand, orderReceived, orderRejected, orderRemaining, orderSupplierReturned, stockOrderLines, type StockOrder, type StockState } from './engine'

export type NamedWarehouse = { id: string; name: string }

export type LowStock = {
  itemId: string
  itemName: string
  onHand: number
  minStock: number
  managed?: boolean
}

export function lowStock(rows: LowStock[]): LowStock[] {
  return rows
    .filter((row) => row.managed !== false && row.minStock > 0 && row.onHand < row.minStock)
    .sort((a, b) => a.onHand - a.minStock - (b.onHand - b.minStock) || a.itemName.localeCompare(b.itemName, 'ko'))
}

export type SupplyInventoryRow = {
  itemId: string
  itemName: string
  quantities: number[]
  total: number
}

export function supplyItems(items: ItemRecord[]): ItemRecord[] {
  return items.filter(isSupplyItem)
}

export function stockEmptyItemsLead() {
  return '비품이 없습니다. 오른쪽에서 이름을 적고 입고하거나, 기준정보에서 품목을 등록하세요.'
}

export function stockPageLead() {
  return '입고하면 현재고가 늘고 반출하면 줄어듭니다. 자리의 물건은 자산 메뉴입니다.'
}

export function stockInboundItemHint() {
  return '없는 이름은 입고할 때 비품으로 등록됩니다. 자리의 물건은 자산 메뉴입니다.'
}

export function stockAssetsLinkLabel() {
  return '자리의 물건은 자산'
}

export function stockIssuePersonName() {
  return ''
}

export function stockDraftOrderId() {
  return ''
}

export function stockAdjustReason() {
  return ''
}

export function stockAdjustLead(bookQty: number, countedText: string) {
  const counted = Number(countedText)
  if (!countedText.trim() || !Number.isFinite(counted)) return `장부 ${bookQty}`
  const delta = counted - bookQty
  if (delta === 0) return `장부 ${bookQty} · 맞음`
  const signed = delta > 0 ? `+${delta}` : String(delta)
  return `장부 ${bookQty} · 차이 ${signed}`
}

export function inventoryWarehouseColumns(warehouses: NamedWarehouse[]): NamedWarehouse[] {
  return warehouses.length > 1 ? warehouses : []
}

export function inventoryWarehouseQtyLabel(warehouseName: string, qty: number) {
  return `${warehouseName} 현재고 ${qty}`
}

export function inventoryShowsWarehouseField(action: string, warehouseCount: number) {
  if (warehouseCount < 1) return false
  return (
    action === 'post_direct_in' ||
    action === 'post_issue' ||
    action === 'post_return' ||
    action === 'post_receipt' ||
    action === 'post_outbound' ||
    action === 'adjust_stock' ||
    action === 'post_supplier_return' ||
    action === 'convert_to_asset'
  )
}

export function inventoryShowsTransferFields(action: string, warehouseCount: number) {
  return action === 'transfer_stock' && warehouseCount > 1
}

export function stockTransferLead() {
  return '보내는 창고에서 받는 창고로 옮깁니다. 회사 합계는 그대로입니다.'
}

export function defaultWarehouseId(
  rows: { id: string }[],
  state?: StockState,
  itemId?: string,
) {
  if (state && itemId) {
    let best: { id: string; qty: number } | null = null
    for (const row of rows) {
      const qty = onHand(state, itemId, row.id)
      if (!best || qty > best.qty) best = { id: row.id, qty }
    }
    if (best && best.qty > 0) return best.id
  }
  return rows[0]?.id ?? ''
}

export function transferWarehouseIds(
  rows: { id: string }[],
  state?: StockState,
  itemId?: string,
) {
  const fromWarehouseId = defaultWarehouseId(rows, state, itemId)
  const toWarehouseId = rows.find((row) => row.id !== fromWarehouseId)?.id ?? ''
  return { fromWarehouseId, toWarehouseId }
}

export function stockSupplierReturnLead(net = 0) {
  const base =
    '검수 통과분만 공급사에 돌려 보냅니다. 현재고가 줄고 발주 잔량이 늘어납니다. 불량 거절품 반환은 이 화면에서 다루지 않습니다.'
  if (!(net > 0)) return base
  return `${base} 반품 가능 ${net}.`
}

export function stockSavedNotice(input: {
  duplicate: boolean
  actionLabel: string
  createdItemName?: string
  assetCount: number
  itemName?: string
}) {
  if (input.duplicate) return '같은 거래는 한 번만 반영됩니다.'
  if (input.assetCount) {
    return `${input.itemName} ${input.assetCount}건을 자산으로 등록했습니다. 자산 화면에서 위치를 이관하세요.`
  }
  if (input.createdItemName) {
    return `비품 ${input.createdItemName}을 등록하고 저장했습니다. (${input.actionLabel})`
  }
  return `저장했습니다. (${input.actionLabel})`
}

export function stockLastSaveLead() {
  return '직전 저장을 정정할 수 있습니다.'
}

export function stockReturnSourceLead(personName?: string) {
  const name = personName?.trim()
  if (name && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(name)) {
    return `${name} 반출`
  }
  return '수불부에서 반출 줄을 고르세요.'
}

export function stockReturnLead(personName?: string, issued = 0, left = 0) {
  const source = stockReturnSourceLead(personName)
  if (issued <= 0) return source
  if (left <= 0) return `${source} · 다 돌아왔습니다.`
  return `${source} · 반납 가능 ${left}`
}

export function publicStockOrderId(orderId?: string) {
  const text = orderId?.trim() ?? ''
  if (!text) return ''
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text)) return ''
  if (/^(guest:|sample:)/i.test(text)) return ''
  return text
}

export function stockDirectInLead() {
  return '발주·요청 없이 현재고만 늘립니다. 공급사·사유·증빙·메모는 선택입니다.'
}

export function stockIssueNoteLead() {
  return '목적·반납 예정일·첨부는 선택입니다.'
}

export function assertDueReturnAt(value: string) {
  const text = value.trim()
  if (!text) return ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error('반납 예정일은 날짜로 넣으세요.')
  return text
}

export function assertInboundAt(value: string) {
  const text = value.trim()
  if (!text) throw new Error('입고일을 넣으세요.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error('입고일은 날짜로 넣으세요.')
  return text
}

export function stockOutboundLead() {
  return '출고하면 현재고가 줄어듭니다. 사람 이름은 적지 않습니다.'
}

export function stockReceiptLead(orderId?: string, remaining = 0, defectText = '', asAsset = false) {
  const parts = asAsset
    ? ['수령하면 현재고 없이 자리의 물건으로 등록됩니다.']
    : ['정상만 현재고에 들어갑니다.']
  const defect = Number(defectText)
  if (!asAsset && defectText.trim() && Number.isFinite(defect) && defect > 0) {
    parts.push('불량은 현재고에 넣지 않습니다.')
  }
  const order = publicStockOrderId(orderId)
  if (order) {
    if (remaining > 0) parts.push(`발주 ${order} 잔량 ${remaining}.`)
    else parts.push('이 발주는 다 받았습니다.')
  }
  return parts.join(' ')
}

export function stockConvertLead() {
  return '자리의 물건만 재고에서 자산으로 바꿉니다. 일반 비품 현재고는 그대로입니다.'
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

export function supplyLowStock(items: ItemRecord[], state: StockState): LowStock[] {
  return lowStock(
    supplyItems(items).map((item) => ({
      itemId: item.id,
      itemName: item.name,
      onHand: companyOnHand(state, item.id),
      minStock: item.minStock ?? 0,
      managed: item.stockManaged,
    })),
  )
}

export function lowStockLine(row: Pick<LowStock, 'itemName' | 'onHand' | 'minStock'>) {
  return `${row.itemName} ${row.onHand} / 최소 ${row.minStock}`
}

export function orderRemainingCaption(
  selected: Pick<SupplyInventoryRow, 'itemId'> | undefined,
  order: StockOrder | undefined,
  remaining: number,
): string {
  if (!selected || !order || !stockOrderLines(order).some((line) => line.itemId === selected.itemId)) return ''
  const orderId = publicStockOrderId(order.id)
  if (!orderId) return remaining > 0 ? ` · 미수령 ${remaining}` : ' · 다 받았습니다'
  if (remaining > 0) return ` · 발주 ${orderId} 잔량 ${remaining}`
  return ` · 발주 ${orderId} 다 받았습니다`
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

export type OrderReceiptProgress = '초안' | '미수령' | '부분수령' | '수령완료'

export function orderReceiptProgress(
  row: Pick<PurchaseOrderRow, 'status' | 'remainingQty' | 'receivedQty' | 'rejectedQty'>,
): OrderReceiptProgress {
  if (row.status === 'draft') return '초안'
  if (row.remainingQty <= 0) return '수령완료'
  if (row.receivedQty <= 0 && row.rejectedQty <= 0) return '미수령'
  return '부분수령'
}

export function orderQtyText(qty: number) {
  return qty > 0 ? String(qty) : '—'
}

export function orderInspectCaption(
  row: Pick<PurchaseOrderRow, 'receivedQty' | 'rejectedQty' | 'returnedQty' | 'remainingQty'>,
) {
  const parts: string[] = []
  if (row.receivedQty > 0) parts.push(`정상 ${row.receivedQty}`)
  if (row.rejectedQty > 0) parts.push(`불량 ${row.rejectedQty}`)
  if (row.returnedQty > 0) parts.push(`반품 ${row.returnedQty}`)
  if (row.remainingQty > 0) parts.push(`미수령 ${row.remainingQty}`)
  return parts.join(' · ')
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
    ['발주번호', '품목', '공급사', '발주일', '납기', '첨부', '통화', '발주', '수령', '불량', '반품', '미수령', '상태'].join(','),
    ...rows.map((row) =>
      [
        csvCell(publicStockOrderId(row.orderId)),
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
        orderReceiptProgress(row),
      ].join(','),
    ),
  ]
  return `\uFEFF${lines.join('\n')}\n`
}
