import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { StockLedgerTable } from '../components/StockLedgerTable'
import { WorkGateNotice } from '../components/WorkGateNotice'
import { WorkCompanyControl } from '../components/WorkCompanyControl'
import { isCompanyAssetItem, isSupplyItem, loadItems, type ItemRecord } from '../lib/master/book'
import { ACTIVE_MASTER_WHERE } from '../lib/master/commands'
import { preventImeEnterSubmit } from '../lib/asset/hangulIme'
import { isInboundStockAction, resolveTypedItem } from '../lib/stock/typedItem'
import { allocateReceiptQty } from '../lib/asset/receipt'
import { migrateProcessAssetsToChecks } from '../lib/people/onboarding'
import { retireSupplyAssets } from '../lib/asset/retireSupplies'
import { executeStockCommand, ensureDefaultStockMaster, loadOrderOriginal, loadStockState, orderAttachment } from '../lib/stock/persist'
import { toArrayBuffer } from '../lib/contracts/book'
import { onHand, orderNetReceived, orderRemaining, stockOrderLines, type LedgerLine, type StockCommand, type StockOrderLine, type StockState } from '../lib/stock/engine'
import { buildAssetOrderList, buildSupplyInventory, buildSupplyOrderList, ORDER_CURRENCIES, resolveOrderPartnerId, stockAdjustReason, stockAssetsLinkLabel, stockDraftOrderId, stockEmptyItemsLead, stockInboundItemHint, stockIssuePersonName, stockPageLead, stockSavedNotice, stockSupplierReturnLead, transferWarehouseIds, supplyItems, supplyOrderCsv, type PurchaseOrderRow } from '../lib/stock/inventoryView'
import { DAILY_STOCK_ACTIONS, MORE_STOCK_ACTIONS, stockActionChoices } from '../lib/stock/dailyActions'
import { isSupplyLedgerLine, type LedgerFilter } from '../lib/stock/ledgerView'
import { stockActionItemId, suggestNextStockForm, type NextStockForm } from '../lib/stock/nextAction'
import { loadDisplayCurrency, formatCompanyDate, loadDisplayTimezone } from '../lib/company/displayCurrency'
import { showModuleLink } from '../lib/company/modules'
import { readCompanyModule } from '../lib/company/moduleAccess'
import { ModuleClosed } from '../components/ModuleClosed'
import { canWriteOpenedCompany, mayOpenCompanyWork, workSessionKind } from '../lib/company/workGate'
import { useWorkAccess } from '../lib/guest/workAccess'
import { assertGuestOpensMemory } from '../lib/guest/seed'
import { showsWorkDbReopen, workOpenedNotice } from '../lib/data/storageStatus'
import { publicErrorMessage } from '../lib/publicError'

type NamedRow = { id: string; name: string }
type ActionType = StockCommand['type']
type ExtraOrderLine = { key: string; itemId: string; qty: string }

const ACTIONS = [...DAILY_STOCK_ACTIONS, ...MORE_STOCK_ACTIONS]

function downloadSupplyOrderCsv(rows: PurchaseOrderRow[]) {
  const blob = new Blob([supplyOrderCsv(rows)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = '비품-발주.csv'
  link.click()
  URL.revokeObjectURL(url)
}

export function StockPage() {
  const { guest, sqlite, loading, configured, user, companies, companyId, sessionReady, setCompanyId, href } =
    useWorkAccess()
  const [items, setItems] = useState<ItemRecord[]>([])
  const [partners, setPartners] = useState<NamedRow[]>([])
  const [warehouses, setWarehouses] = useState<NamedRow[]>([])
  const [departments, setDepartments] = useState<NamedRow[]>([])
  const [orderPartnerId, setOrderPartnerId] = useState('')
  const [orderDueDate, setOrderDueDate] = useState('')
  const [orderDate, setOrderDate] = useState(() => formatCompanyDate(new Date(), 'Asia/Seoul'))
  const [today, setToday] = useState(() => formatCompanyDate(new Date(), 'Asia/Seoul'))
  const [orderCurrency, setOrderCurrency] = useState('KRW')
  const currencyTouched = useRef(false)
  const [extraLines, setExtraLines] = useState<ExtraOrderLine[]>([])
  const [orderFileName, setOrderFileName] = useState('')
  const [pendingOrderFile, setPendingOrderFile] = useState<{
    fileName: string
    fileMime: string
    fileBase64: string
  } | null>(null)
  const orderFileInput = useRef<HTMLInputElement>(null)
  const [state, setState] = useState<StockState | null>(null)
  const [action, setAction] = useState<ActionType>('post_direct_in')
  const [showMoreActions, setShowMoreActions] = useState(false)
  const [operationId, setOperationId] = useState('')
  const [orderId, setOrderId] = useState(stockDraftOrderId)
  const [itemId, setItemId] = useState('')
  const [warehouseId, setWarehouseId] = useState('')
  const { fromWarehouseId, toWarehouseId } = transferWarehouseIds(warehouses)
  const [qty, setQty] = useState('1')
  const [defectQty, setDefectQty] = useState('0')
  const [personName, setPersonName] = useState(stockIssuePersonName)
  const [departmentId, setDepartmentId] = useState('')
  const [sourceOperationId, setSourceOperationId] = useState('')
  const [reason, setReason] = useState(stockAdjustReason)
  const [message, setMessage] = useState('')
  const [notice, setNotice] = useState('')
  const [lastOperationId, setLastOperationId] = useState('')
  const [ready, setReady] = useState(() => sqlite.isOpen(sqlite.companyId))
  const [moduleOff, setModuleOff] = useState(false)
  const [assetsLink, setAssetsLink] = useState(true)
  const [openFailed, setOpenFailed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [ledgerFilter, setLedgerFilter] = useState<LedgerFilter>('all')
  const [selectedLine, setSelectedLine] = useState<LedgerLine | null>(null)
  const opening = useRef(false)

  useEffect(() => {
    if (!companyId || opening.current || openFailed) return
    void openCompany(companyId)
  }, [companyId, openFailed])

  async function openCompany(nextId: string, force = false) {
    if (!mayOpenCompanyWork(guest, nextId, companies)) return
    opening.current = true
    setCompanyId(nextId)
    setMessage('')
    setNotice('')
    setOpenFailed(false)
    try {
      await sqlite.open(nextId, { force })
      assertGuestOpensMemory(guest, sqlite.vfsName)
      setReady(sqlite.persistOk)
      if (!sqlite.persistOk) {
        setOpenFailed(true)
        setMessage('이 브라우저에서 영속 DB를 열 수 없습니다. 지정 Chrome에서 초기 설정을 먼저 하세요.')
        return
      }
      if (!guest && !(await readCompanyModule(sqlite, nextId, 'stock'))) {
        setModuleOff(true)
        setReady(true)
        return
      }
      setModuleOff(false)
      setAssetsLink(showModuleLink(guest, guest ? true : await readCompanyModule(sqlite, nextId, 'assets')))
      const stamp = formatCompanyDate(new Date(), guest ? 'Asia/Seoul' : await loadDisplayTimezone(sqlite))
      setToday(stamp)
      setOrderDate(stamp)
      if (!guest) {
        await ensureDefaultStockMaster(sqlite, companies.find((row) => row.id === nextId)?.company_code)
        await migrateProcessAssetsToChecks(sqlite)
        await retireSupplyAssets(sqlite)
      }
      await reload()
      setNotice(workOpenedNotice(guest))
    } catch (error) {
      setReady(false)
      setOpenFailed(true)
      setMessage(publicErrorMessage(error))
    } finally {
      opening.current = false
    }
  }

  async function reload() {
    const [itemRows, partnerRows, warehouseRows, deptRows, nextState] = await Promise.all([
      loadItems(sqlite),
      sqlite.query<NamedRow>(`select id, name from partners where ${ACTIVE_MASTER_WHERE} order by name`),
      sqlite.query<NamedRow>(`select id, name from warehouses where ${ACTIVE_MASTER_WHERE} order by name`),
      sqlite.query<NamedRow>(`select id, name from departments where ${ACTIVE_MASTER_WHERE} order by name`),
      loadStockState(sqlite),
    ])
    setItems(itemRows)
    setPartners(partnerRows)
    setWarehouses(warehouseRows)
    setDepartments(deptRows)
    setState(nextState)
    if (!currencyTouched.current) setOrderCurrency(await loadDisplayCurrency(sqlite))
    setSelectedLine((prev) => {
      const visible = nextState.ledger.filter(isSupplyLedgerLine)
      if (prev) {
        const found = visible.find((line) => line.id === prev.id)
        if (found) return found
      }
      return visible[visible.length - 1] ?? null
    })
    const nextStockItems = supplyItems(itemRows)
    const keepItem = itemRows.find((row) => row.id === itemId)
    if (!keepItem || !(isSupplyItem(keepItem) || isCompanyAssetItem(keepItem))) {
      setItemId(nextStockItems[0]?.id ?? '')
    }
    const selectedItem =
      keepItem && (isSupplyItem(keepItem) || isCompanyAssetItem(keepItem))
        ? keepItem
        : nextStockItems[0]
    if (selectedItem?.partnerId) {
      setOrderPartnerId((prev) => prev || selectedItem.partnerId || '')
    }
    if (!warehouseRows.some((row) => row.id === warehouseId) && warehouseRows[0]) {
      setWarehouseId(warehouseRows[0].id)
    }
  }

  function chooseItem(nextItemId: string) {
    setItemId(nextItemId)
    const item = items.find((row) => row.id === nextItemId)
    setOrderPartnerId(item?.partnerId ?? '')
  }

  function chooseOrder(row: PurchaseOrderRow) {
    setOrderId(row.orderId)
    setItemId(row.itemId)
    setOrderPartnerId(row.partnerId ?? '')
    setOrderDueDate(row.dueDate ?? '')
    setOrderDate(row.orderDate || today)
    currencyTouched.current = true
    setOrderCurrency(row.currency || 'KRW')
    setOrderFileName(row.fileName)
    setPendingOrderFile(null)
    const order = state?.orders.get(row.orderId)
    const others = stockOrderLines(order ?? { itemId: row.itemId, qty: row.orderedQty }).filter(
      (line) => line.itemId !== row.itemId,
    )
    setExtraLines(
      others.map((line) => ({
        key: `${row.orderId}-${line.itemId}`,
        itemId: line.itemId,
        qty: String(line.qty),
      })),
    )
  }

  async function pickOrderFile(file: File) {
    setMessage('')
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      const attached = orderAttachment({ name: file.name, mime: file.type, bytes })
      setPendingOrderFile(attached)
      setOrderFileName(attached.fileName)
    } catch (error) {
      setMessage(publicErrorMessage(error))
      if (orderFileInput.current) orderFileInput.current.value = ''
    }
  }

  async function downloadOrderFile() {
    setMessage('')
    try {
      const original = await loadOrderOriginal(sqlite, orderId)
      const url = URL.createObjectURL(new Blob([toArrayBuffer(original.bytes)], { type: original.fileMime }))
      const link = document.createElement('a')
      link.href = url
      link.download = original.fileName
      link.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      setMessage(publicErrorMessage(error))
    }
  }

  function applySuggestedForm(next: NextStockForm | null) {
    if (!next) {
      setAction('post_issue')
      setQty('1')
      const supplyId = stockActionItemId('post_issue', itemId, items)
      if (supplyId && supplyId !== itemId) chooseItem(supplyId)
      return
    }
    setAction(next.action)
    setQty(next.qty)
    const nextItemId = stockActionItemId(next.action, itemId, items, next.itemId)
    if (nextItemId && nextItemId !== itemId) {
      if (next.action === 'post_issue' || next.action === 'post_outbound' || next.action === 'post_supplier_return') chooseItem(nextItemId)
      else setItemId(nextItemId)
    }
    if (next.sourceOperationId) setSourceOperationId(next.sourceOperationId)
    if (next.warehouseId) setWarehouseId(next.warehouseId)
  }

  function onActionChange(nextAction: ActionType) {
    setAction(nextAction)
    if (!state) return
    const suggested = suggestNextStockForm(
      state,
      orderId,
      items.find((row) => row.id === itemId),
    )
    if (suggested?.action === nextAction) {
      applySuggestedForm(suggested)
      return
    }
    if (nextAction === 'post_direct_in') {
      setQty((prev) => (Number(prev) > 0 ? prev : '1'))
      return
    }
    if (nextAction === 'post_receipt') {
      const remainingQty = orderRemaining(state, orderId, itemId)
      setQty(String(remainingQty > 0 ? remainingQty : 1))
      return
    }
    if (nextAction === 'post_issue' || nextAction === 'post_outbound' || nextAction === 'post_supplier_return') {
      const supplyId = stockActionItemId(nextAction, itemId, items)
      if (supplyId && supplyId !== itemId) chooseItem(supplyId)
      const useItem = supplyId && supplyId !== itemId ? supplyId : itemId
      const onHandQty = onHand(state, useItem, warehouseId)
      const returnable =
        nextAction === 'post_supplier_return' ? Math.min(onHandQty, orderNetReceived(state, orderId, useItem)) : onHandQty
      setQty(String(returnable > 0 ? Math.min(1, returnable) : 1))
      return
    }
    if (nextAction === 'post_return') setQty('1')
    if (nextAction === 'transfer_stock') setQty('2')
  }

  function buildCommand(
    nextOperationId: string,
    nextItemId = itemId,
    nextItem?: ItemRecord,
    moreLines: StockOrderLine[] = [],
  ): StockCommand {
    const quantity = Number(qty)
    switch (action) {
      case 'draft_order':
      case 'confirm_order':
        return {
          type: action,
          operationId: nextOperationId,
          orderId,
          itemId: nextItemId,
          qty: quantity,
          partnerId: resolveOrderPartnerId(
            orderPartnerId,
            nextItem ?? items.find((row) => row.id === nextItemId),
          ),
          dueDate: orderDueDate.trim() || undefined,
          orderDate: orderDate.trim() || undefined,
          currency: orderCurrency,
          ...(pendingOrderFile ?? {}),
          ...(moreLines.length
            ? { lines: [{ itemId: nextItemId, qty: quantity }, ...moreLines] }
            : {}),
        }
      case 'post_receipt':
        return {
          type: action,
          operationId: nextOperationId,
          orderId,
          itemId: nextItemId,
          warehouseId,
          qty: quantity,
          ...(Number(defectQty) > 0 ? { defectQty: Number(defectQty) } : {}),
        }
      case 'post_supplier_return':
        return {
          type: action,
          operationId: nextOperationId,
          orderId,
          itemId: nextItemId,
          warehouseId,
          qty: quantity,
        }
      case 'post_direct_in':
      case 'post_outbound':
      case 'convert_to_asset':
        return { type: action, operationId: nextOperationId, itemId: nextItemId, warehouseId, qty: quantity }
      case 'post_issue':
        return {
          type: action,
          operationId: nextOperationId,
          itemId: nextItemId,
          warehouseId,
          qty: quantity,
          personName: personName.trim() || undefined,
          departmentId: departmentId.trim() || undefined,
        }
      case 'post_return':
        return {
          type: action,
          operationId: nextOperationId,
          itemId: nextItemId,
          warehouseId,
          qty: quantity,
          sourceOperationId,
        }
      case 'transfer_stock':
        return {
          type: action,
          operationId: nextOperationId,
          itemId: nextItemId,
          fromWarehouseId,
          toWarehouseId,
          qty: quantity,
        }
      case 'adjust_stock':
        return {
          type: action,
          operationId: nextOperationId,
          itemId: nextItemId,
          warehouseId,
          countedQty: quantity,
          reason,
        }
      case 'reverse_transaction':
        return { type: action, operationId: nextOperationId, sourceOperationId }
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!ready || !canWriteOpenedCompany(guest, companyId, sqlite.companyId)) return
    setMessage('')
    setSaving(true)
    const nextOperationId = operationId.trim() || crypto.randomUUID()
    try {
      const typedName = String(new FormData(event.currentTarget).get('itemName') ?? '')
      const formData = new FormData(event.currentTarget)
      const resolved =
        action === 'reverse_transaction'
          ? { item: items.find((row) => row.id === itemId) ?? { id: itemId, name: typedName, stockManaged: true, assetManaged: false }, created: false }
          : resolveTypedItem(items, typedName, {
              createIfMissing: isInboundStockAction(action),
              newId: `item-${crypto.randomUUID()}`,
            })
      const extraResolved: { item: ItemRecord; created: boolean; qty: number }[] = []
      if (action === 'draft_order' || action === 'confirm_order') {
        const known = [...items]
        if (resolved.created) known.push(resolved.item)
        for (const extra of extraLines) {
          const extraName = String(formData.get(`lineItemName-${extra.key}`) ?? '')
          if (!extraName.trim()) continue
          const extraQty = Number(String(formData.get(`lineQty-${extra.key}`) ?? extra.qty))
          const nextExtra = resolveTypedItem(known, extraName, {
            createIfMissing: true,
            newId: `item-${crypto.randomUUID()}`,
          })
          extraResolved.push({ ...nextExtra, qty: extraQty })
          if (nextExtra.created) known.push(nextExtra.item)
        }
      }
      setItemId(resolved.item.id)
      const createdItems = [
        ...(resolved.created ? [resolved.item] : []),
        ...extraResolved.filter((row) => row.created).map((row) => row.item),
      ]
      const result = await executeStockCommand(
        sqlite,
        buildCommand(
          nextOperationId,
          resolved.item.id,
          resolved.item,
          extraResolved.map((row) => ({ itemId: row.item.id, qty: row.qty })),
        ),
        undefined,
        createdItems.length ? { newItem: createdItems[0], newItems: createdItems.slice(1) } : undefined,
      )
      setLastOperationId(nextOperationId)
      setOperationId('')
      const receiptItem = resolved.item
      const assetCount =
        action === 'post_receipt' && result.status === 'applied'
          ? allocateReceiptQty(receiptItem, Number(qty)).assetQty
          : 0
      setNotice(
        stockSavedNotice({
          duplicate: result.status === 'duplicate',
          actionLabel: ACTIONS.find((item) => item.id === action)?.label ?? '확정',
          createdItemName: resolved.created ? receiptItem.name : undefined,
          assetCount,
          itemName: receiptItem.name,
        }),
      )
      if (result.status === 'applied') {
        if (action === 'draft_order' || action === 'confirm_order') {
          setPendingOrderFile(null)
          if (orderFileInput.current) orderFileInput.current.value = ''
        }
        if (action === 'post_receipt') setDefectQty('0')
      }
      await reload()
    } catch (error) {
      setMessage(publicErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="text-sm text-muted">세션을 확인하는 중입니다.</p>
  if (!guest && !configured) return <p className="text-sm text-muted">중앙 운영이 연결되지 않았습니다.</p>
  const gated = workSessionKind({
    guest,
    signedIn: Boolean(user),
    ready: sessionReady,
    companyId,
  })
  if (gated !== 'ok') {
    return (
      <WorkGateNotice
        guest={guest}
        signedIn={Boolean(user)}
        ready={sessionReady}
        companyId={companyId}
        loginHint="구매·재고는 로그인 후 지정 PC에서 다룹니다."
      />
    )
  }
  if (!guest && moduleOff) {
    return (
      <ModuleClosed
        title="구매·재고"
        companies={companies}
        companyId={companyId}
        onOpen={(id) => {
          setReady(false)
          void openCompany(id, true)
        }}
      />
    )
  }

  const stockItems = supplyItems(items)
  const orderableItems = items.filter((item) => isSupplyItem(item) || isCompanyAssetItem(item))
  const formItems =
    action === 'draft_order' || action === 'confirm_order' || action === 'post_receipt' ? orderableItems : stockItems
  const inventory =
    state && stockItems.length && warehouses.length ? buildSupplyInventory(stockItems, warehouses, state) : []
  const selectedInventory = inventory.find((row) => row.itemId === itemId) ?? inventory[0]
  const supplyOrders = state ? buildSupplyOrderList(items, state, partners) : []
  const assetOrders = state ? buildAssetOrderList(items, state, partners) : []

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">구매·재고</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted">
            {stockPageLead()}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {guest ? (
            <p className="rounded border border-line px-3 py-2 text-sm text-muted">샘플 회사</p>
          ) : (
            <WorkCompanyControl
              guest={false}
              companies={companies}
              companyId={companyId}
              onChange={(id) => {
                setReady(false)
                setOpenFailed(false)
                void openCompany(id, true)
              }}
            />
          )}
          {showsWorkDbReopen(openFailed) ? (
            <button
              type="button"
              className="rounded border border-line px-3 py-2 text-sm"
              disabled={!companyId}
              onClick={() => {
                setReady(false)
                setOpenFailed(false)
                void openCompany(companyId, true)
              }}
            >
              이 회사 DB 다시 열기
            </button>
          ) : null}
        </div>
      </div>

      <div className="grid min-h-0 gap-4 lg:grid-cols-[12.5rem_minmax(0,1fr)_22rem] lg:items-start">
      <section className="rounded-lg border border-line bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold">재고현황</h2>
            {selectedInventory ? (
              <p className="mt-1 text-sm text-muted">
                {selectedInventory.itemName}{' '}
                <strong className="text-ink tabular-nums">{selectedInventory.total}</strong>
              </p>
            ) : null}
          </div>
          {assetsLink ? (
            <Link className="text-sm text-accent underline" to={href('/assets')}>
              {stockAssetsLinkLabel()}
            </Link>
          ) : null}
        </div>
        {inventory.length ? (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-muted">
                  <th className="py-1.5 pr-3 font-medium">비품</th>
                  <th className="py-1.5 text-right font-medium">수량</th>
                </tr>
              </thead>
              <tbody>
                {inventory.map((row) => {
                  const active = row.itemId === itemId
                  return (
                    <tr
                      key={row.itemId}
                      className={`cursor-pointer border-b border-line/70 ${
                        active ? 'bg-accent-soft' : 'hover:bg-paper'
                      }`}
                      onClick={() => chooseItem(row.itemId)}
                    >
                      <td className="py-1.5 pr-3 font-medium">{row.itemName}</td>
                      <td className="py-1.5 text-right font-semibold tabular-nums">{row.total}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted">
            {ready ? stockEmptyItemsLead() : '회사 DB를 여는 중입니다.'}
          </p>
        )}
      </section>

      <section className="flex min-h-0 flex-col rounded-lg border border-line bg-card p-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold">수불부</h2>
            <p className="mt-1 text-sm text-muted">들어온 수량과 나간 수량을 이어 보여 줍니다.</p>
          </div>
          <div className="flex rounded border border-line text-sm">
            {(
              [
                ['all', '전체'],
                ['in', '입고만'],
                ['out', '출고만'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={ledgerFilter === id}
                className={`px-3 py-1.5 ${
                  ledgerFilter === id ? 'bg-accent-soft font-semibold text-accent' : 'text-muted'
                }`}
                onClick={() => setLedgerFilter(id)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {supplyOrders.length || assetOrders.length ? (
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer text-muted">발주 기록 {supplyOrders.length + assetOrders.length}</summary>
            <div className="mt-2 space-y-3">
            {supplyOrders.length ? (
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">비품 발주 {supplyOrders.length}</h3>
                  <button
                    type="button"
                    className="rounded border border-line px-2 py-1 text-xs font-semibold"
                    onClick={() => downloadSupplyOrderCsv(supplyOrders)}
                  >
                    목록 받기
                  </button>
                </div>
                <div className="mt-2 overflow-x-auto">
                  <table className="min-w-max w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-line text-muted">
                        <th className="whitespace-nowrap py-1.5 pr-3 font-medium">발주번호</th>
                        <th className="whitespace-nowrap py-1.5 pr-3 font-medium">품목</th>
                        <th className="whitespace-nowrap py-1.5 pr-3 font-medium">공급사</th>
                        <th className="whitespace-nowrap py-1.5 pr-3 font-medium">발주일</th>
                        <th className="whitespace-nowrap py-1.5 pr-3 font-medium">납기</th>
                        <th className="whitespace-nowrap py-1.5 pr-3 font-medium">첨부</th>
                        <th className="whitespace-nowrap py-1.5 pr-3 font-medium">통화</th>
                        <th className="whitespace-nowrap py-1.5 pr-3 text-right font-medium">발주</th>
                        <th className="whitespace-nowrap py-1.5 pr-3 text-right font-medium">수령</th>
                        <th className="whitespace-nowrap py-1.5 pr-3 text-right font-medium">불량</th>
                        <th className="whitespace-nowrap py-1.5 pr-3 text-right font-medium">반품</th>
                        <th className="whitespace-nowrap py-1.5 pr-3 text-right font-medium">잔량</th>
                        <th className="whitespace-nowrap py-1.5 font-medium">상태</th>
                      </tr>
                    </thead>
                    <tbody>
                      {supplyOrders.map((row) => {
                        const active = row.orderId === orderId && row.itemId === itemId
                        return (
                          <tr
                            key={`${row.orderId}:${row.itemId}`}
                            className={`cursor-pointer border-b border-line/70 ${
                              active ? 'bg-accent-soft' : 'hover:bg-paper'
                            }`}
                            onClick={() => {
                              setShowMoreActions(true)
                              chooseOrder(row)
                            }}
                          >
                            <td className="whitespace-nowrap py-1.5 pr-3 font-medium">{row.orderId}</td>
                            <td className="whitespace-nowrap py-1.5 pr-3">{row.itemName}</td>
                            <td className="whitespace-nowrap py-1.5 pr-3">{row.supplierName || '—'}</td>
                            <td className="whitespace-nowrap py-1.5 pr-3">{row.orderDate || '—'}</td>
                            <td className="whitespace-nowrap py-1.5 pr-3">{row.dueDate || '—'}</td>
                            <td className="whitespace-nowrap py-1.5 pr-3">{row.fileName || '—'}</td>
                            <td className="whitespace-nowrap py-1.5 pr-3">{row.currencyName}</td>
                            <td className="whitespace-nowrap py-1.5 pr-3 text-right tabular-nums">{row.orderedQty}</td>
                            <td className="whitespace-nowrap py-1.5 pr-3 text-right tabular-nums">{row.receivedQty}</td>
                            <td className="whitespace-nowrap py-1.5 pr-3 text-right tabular-nums">{row.rejectedQty}</td>
                            <td className="whitespace-nowrap py-1.5 pr-3 text-right tabular-nums">{row.returnedQty}</td>
                            <td className="whitespace-nowrap py-1.5 pr-3 text-right tabular-nums">{row.remainingQty}</td>
                            <td className="whitespace-nowrap py-1.5">{row.status === 'draft' ? '초안' : '확정'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
            {assetOrders.length ? (
              <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
                {assetOrders.map((row) => (
                  <li key={`${row.orderId}:${row.itemId}`}>
                    <button
                      type="button"
                      className={`text-left ${row.orderId === orderId ? 'font-semibold text-accent' : 'hover:text-ink'}`}
                      onClick={() => {
                        setShowMoreActions(true)
                        chooseOrder(row)
                      }}
                    >
                      자산 발주 {row.orderId} · {row.itemName} {row.orderedQty}
                      {row.supplierName ? ` · ${row.supplierName}` : ''}
                      {row.orderDate ? ` · 발주일 ${row.orderDate}` : ''}
                      {row.dueDate ? ` · 납기 ${row.dueDate}` : ''}
                      {row.fileName ? ` · ${row.fileName}` : ''}
                      {row.currencyName ? ` · ${row.currencyName}` : ''} ·{' '}
                      {row.status === 'draft' ? '초안' : `잔량 ${row.remainingQty}`}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            </div>
          </details>
        ) : null}
        <div className="mt-1 min-h-0 max-h-[calc(100svh-14rem)] overflow-auto">
        <StockLedgerTable
          ledger={state?.ledger ?? []}
          items={items}
          warehouses={warehouses}
          departments={departments}
          filter={ledgerFilter}
          selected={selectedLine}
          variant="supply"
          onSelect={(line) => {
            setSelectedLine(line)
            if (line.txnType === 'issue' || line.txnType === 'outbound') {
              setSourceOperationId(line.operationId)
            } else if (line.sourceOperationId) {
              setSourceOperationId(line.sourceOperationId)
            }
          }}
        />
        </div>
      </section>

      <div className="flex flex-col gap-3">
      <form
        id="stock-command"
        className="grid gap-3 rounded-lg border border-line bg-card p-4"
        lang="ko"
        onKeyDown={preventImeEnterSubmit}
        onSubmit={onSubmit}
      >
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-[10rem] flex-1 text-sm">
            명령
            <select
              className="mt-1 w-full rounded border border-line px-3 py-2"
              value={action}
              onChange={(e) => onActionChange(e.target.value as ActionType)}
            >
              {stockActionChoices(showMoreActions, action).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="mb-0.5 text-xs font-semibold text-accent"
            onClick={() => setShowMoreActions((prev) => !prev)}
          >
            {showMoreActions ? '매일 명령만' : '발주·검수 더 보기'}
          </button>
          {action !== 'reverse_transaction' ? (
            <label className="w-28 text-sm">
              {action === 'adjust_stock' ? '실사 수량' : action === 'post_receipt' ? '정상' : '수량'}
              <input
                className="mt-1 w-full rounded border border-line px-3 py-2"
                type="number"
                min="0"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
              />
            </label>
          ) : null}
          {action === 'post_receipt' ? (
            <label className="w-28 text-sm">
              불량
              <input
                className="mt-1 w-full rounded border border-line px-3 py-2"
                type="number"
                min="0"
                value={defectQty}
                onChange={(e) => setDefectQty(e.target.value)}
              />
            </label>
          ) : null}
          <button
            type="submit"
            disabled={!ready || saving}
            className="rounded bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {ACTIONS.find((item) => item.id === action)?.label ?? '확정'}
          </button>
        </div>
        {notice ? <p className="text-sm text-ok">{notice}</p> : null}
        {message ? <p className="text-sm text-danger">{message}</p> : null}
        <div className="grid gap-3 sm:grid-cols-2">
          {action === 'draft_order' || action === 'confirm_order' || action === 'post_receipt' || action === 'post_supplier_return' ? (
            <label className="text-sm">
              발주 번호
              <input
                className="mt-1 w-full rounded border border-line px-3 py-2"
                value={orderId}
                onChange={(e) => setOrderId(e.target.value)}
              />
            </label>
          ) : null}
          {action === 'draft_order' || action === 'confirm_order' ? (
            <label className="text-sm">
              공급사
              <select
                className="mt-1 w-full rounded border border-line px-3 py-2"
                value={orderPartnerId}
                onChange={(e) => setOrderPartnerId(e.target.value)}
              >
                <option value="">없음</option>
                {partners.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {action === 'draft_order' || action === 'confirm_order' ? (
            <label className="text-sm">
              발주일
              <input
                className="mt-1 w-full rounded border border-line px-3 py-2"
                type="date"
                value={orderDate}
                onChange={(e) => setOrderDate(e.target.value)}
              />
            </label>
          ) : null}
          {action === 'draft_order' || action === 'confirm_order' ? (
            <label className="text-sm">
              납기
              <input
                className="mt-1 w-full rounded border border-line px-3 py-2"
                type="date"
                value={orderDueDate}
                onChange={(e) => setOrderDueDate(e.target.value)}
              />
            </label>
          ) : null}
          {action === 'draft_order' || action === 'confirm_order' ? (
            <label className="text-sm">
              통화
              <select
                className="mt-1 w-full rounded border border-line px-3 py-2"
                value={orderCurrency}
                onChange={(e) => {
                  currencyTouched.current = true
                  setOrderCurrency(e.target.value)
                }}
              >
                {ORDER_CURRENCIES.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {action === 'draft_order' || action === 'confirm_order' ? (
            <div className="text-sm">
              첨부
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <input
                  ref={orderFileInput}
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) void pickOrderFile(file)
                  }}
                />
                <button
                  type="button"
                  disabled={!ready || saving}
                  className="rounded border border-line px-3 py-2 text-sm font-semibold disabled:opacity-50"
                  onClick={() => orderFileInput.current?.click()}
                >
                  첨부
                </button>
                {orderFileName && !pendingOrderFile ? (
                  <button
                    type="button"
                    disabled={!ready || saving}
                    className="rounded border border-line px-3 py-2 text-sm disabled:opacity-50"
                    onClick={() => void downloadOrderFile()}
                  >
                    {orderFileName}
                  </button>
                ) : (
                  <span className="text-xs text-muted">{orderFileName || 'PDF·PNG·JPEG 8MB'}</span>
                )}
              </div>
            </div>
          ) : null}
          {action !== 'reverse_transaction' ? (
            <label className="text-sm">
              품목
              <input
                key={itemId}
                name="itemName"
                list="stock-item-names"
                autoComplete="off"
                className="mt-1 w-full rounded border border-line px-3 py-2"
                defaultValue={items.find((row) => row.id === itemId)?.name ?? ''}
                placeholder="이름을 치세요"
              />
              <datalist id="stock-item-names">
                {formItems.map((item) => (
                  <option key={item.id} value={item.name} />
                ))}
              </datalist>
              <span className="mt-1 block text-xs text-muted">
                {isInboundStockAction(action)
                  ? stockInboundItemHint()
                  : '있는 비품 이름만 반출·출고할 수 있습니다.'}
              </span>
            </label>
          ) : null}
          {action === 'draft_order' || action === 'confirm_order' ? (
            <div className="text-sm">
              <div className="flex items-center justify-between gap-2">
                <span>품목 줄</span>
                <button
                  type="button"
                  className="text-xs font-semibold text-accent"
                  onClick={() =>
                    setExtraLines((prev) => [...prev, { key: crypto.randomUUID(), itemId: '', qty: '1' }])
                  }
                >
                  품목 줄 추가
                </button>
              </div>
              {extraLines.length ? (
                <ul className="mt-2 space-y-2">
                  {extraLines.map((line) => (
                    <li key={line.key} className="flex flex-wrap items-end gap-2">
                      <label className="min-w-[8rem] flex-1 text-sm">
                        품목
                        <input
                          key={`${line.key}-${line.itemId}`}
                          name={`lineItemName-${line.key}`}
                          list="stock-item-names"
                          autoComplete="off"
                          className="mt-1 w-full rounded border border-line px-3 py-2"
                          defaultValue={items.find((row) => row.id === line.itemId)?.name ?? ''}
                          placeholder="이름을 치세요"
                        />
                      </label>
                      <label className="w-24 text-sm">
                        수량
                        <input
                          name={`lineQty-${line.key}`}
                          className="mt-1 w-full rounded border border-line px-3 py-2"
                          inputMode="numeric"
                          defaultValue={line.qty}
                        />
                      </label>
                      <button
                        type="button"
                        className="mb-0.5 text-xs text-muted"
                        onClick={() => setExtraLines((prev) => prev.filter((row) => row.key !== line.key))}
                      >
                        줄 삭제
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-xs text-muted">같은 발주서에 비품·자재·서비스·자산을 더 넣을 수 있습니다.</p>
              )}
            </div>
          ) : null}
        </div>
        {action === 'post_issue' ? (
          <>
            <label className="text-sm">
              반출 성명
              <input
                className="mt-1 w-full rounded border border-line px-3 py-2"
                value={personName}
                onChange={(e) => setPersonName(e.target.value)}
              />
            </label>
            <label className="text-sm">
              반출 부서
              <select
                className="mt-1 w-full rounded border border-line px-3 py-2"
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
              >
                <option value="">선택 안 함</option>
                {departments.map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    {dept.name}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : null}
        {action === 'post_supplier_return' ? (
          <p className="text-sm text-muted">{stockSupplierReturnLead()}</p>
        ) : null}
        {action === 'post_return' ? (
          <p className="text-sm text-muted">
            원거래:{' '}
            {state?.ledger.find((line) => line.operationId === sourceOperationId)?.personName
              ? `${state.ledger.find((line) => line.operationId === sourceOperationId)?.personName} 반출`
              : sourceOperationId || '수불부에서 반출 줄을 고르세요.'}
          </p>
        ) : action === 'reverse_transaction' ? (
          <label className="text-sm">
            원거래
            <input
              className="mt-1 w-full rounded border border-line px-3 py-2"
              value={sourceOperationId}
              onChange={(e) => setSourceOperationId(e.target.value)}
              placeholder={lastOperationId}
            />
          </label>
        ) : null}
        {action === 'adjust_stock' ? (
          <label className="text-sm">
            실사 사유
            <input
              className="mt-1 w-full rounded border border-line px-3 py-2"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
        ) : null}
        <details className="text-sm text-muted">
          <summary className="cursor-pointer">거래 번호 (비워 두면 새로 발급)</summary>
          <input
            className="mt-2 w-full rounded border border-line px-3 py-2 text-ink"
            value={operationId}
            onChange={(e) => setOperationId(e.target.value)}
            placeholder="새로 발급"
          />
          {lastOperationId ? <p className="mt-1 text-xs">직전 거래: {lastOperationId}</p> : null}
        </details>
      </form>
      </div>
      </div>
    </div>
  )
}
