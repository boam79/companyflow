import { useEffect, useRef, useState, type FormEvent } from 'react'
import { flushSync } from 'react-dom'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { StockLedgerTable } from '../components/StockLedgerTable'
import { loadItems, type ItemRecord } from '../lib/master/book'
import { migrateProcessAssetsToChecks } from '../lib/people/onboarding'
import { retireSupplyAssets } from '../lib/asset/retireSupplies'
import { getCompanySqlite } from '../lib/sqlite/instance'
import { executeStockCommand, ensureDefaultStockMaster, loadStockState } from '../lib/stock/persist'
import { companyOnHand, onHand, orderRemaining, type LedgerLine, type StockCommand, type StockState } from '../lib/stock/engine'
import { buildSupplyInventory, supplyItems } from '../lib/stock/inventoryView'
import { isSupplyLedgerLine, type LedgerFilter } from '../lib/stock/ledgerView'
import { commandFromSuggestion, suggestNextStockForm, type NextStockForm } from '../lib/stock/nextAction'
import { getSupabase, type CompanyRow } from '../lib/supabase'

type NamedRow = { id: string; name: string }
type ActionType = StockCommand['type']

const sqlite = getCompanySqlite()
const ACTIONS: { id: ActionType; label: string }[] = [
  { id: 'confirm_order', label: '발주 확정' },
  { id: 'post_receipt', label: '수령' },
  { id: 'post_issue', label: '반출' },
  { id: 'post_return', label: '반납' },
  { id: 'draft_order', label: '발주 초안' },
  { id: 'post_direct_in', label: '직접 입고' },
  { id: 'post_outbound', label: '출고' },
  { id: 'adjust_stock', label: '실사 조정' },
  { id: 'reverse_transaction', label: '정정' },
]

export function StockPage() {
  const { configured, loading, user } = useAuth()
  const [companies, setCompanies] = useState<CompanyRow[]>([])
  const [companyId, setCompanyId] = useState('')
  const [items, setItems] = useState<ItemRecord[]>([])
  const [warehouses, setWarehouses] = useState<NamedRow[]>([])
  const [departments, setDepartments] = useState<NamedRow[]>([])
  const [state, setState] = useState<StockState | null>(null)
  const [action, setAction] = useState<ActionType>('confirm_order')
  const [operationId, setOperationId] = useState('')
  const [orderId, setOrderId] = useState('ord-paper')
  const [itemId, setItemId] = useState('item-paper')
  const [warehouseId, setWarehouseId] = useState('wh-main')
  const fromWarehouseId = 'wh-main'
  const toWarehouseId = 'wh-sub'
  const [qty, setQty] = useState('10')
  const [personName, setPersonName] = useState('김담당')
  const [departmentId, setDepartmentId] = useState('')
  const [sourceOperationId, setSourceOperationId] = useState('')
  const [reason, setReason] = useState('실사 차이')
  const [message, setMessage] = useState('')
  const [notice, setNotice] = useState('')
  const [lastOperationId, setLastOperationId] = useState('')
  const [ready, setReady] = useState(false)
  const [openFailed, setOpenFailed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [ledgerFilter, setLedgerFilter] = useState<LedgerFilter>('all')
  const [selectedLine, setSelectedLine] = useState<LedgerLine | null>(null)
  const opening = useRef(false)

  useEffect(() => {
    if (!user) return
    const client = getSupabase()
    if (!client) return
    void client
      .from('companies')
      .select('id, display_name, company_code, registration_status')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (!data?.length) return
        setCompanies(data as CompanyRow[])
        setCompanyId((prev) => prev || data[0].id)
      })
  }, [user])

  useEffect(() => {
    if (!companyId || ready || opening.current || openFailed) return
    void openCompany(companyId)
  }, [companyId, ready, openFailed])

  async function openCompany(nextId: string, force = false) {
    opening.current = true
    setCompanyId(nextId)
    setMessage('')
    setNotice('')
    setOpenFailed(false)
    try {
      await sqlite.open(nextId, { force })
      setReady(sqlite.persistOk)
      if (!sqlite.persistOk) {
        setOpenFailed(true)
        setMessage('이 브라우저에서 영속 DB를 열 수 없습니다. 지정 Chrome에서 초기 설정을 먼저 하세요.')
        return
      }
      await ensureDefaultStockMaster(sqlite)
      await migrateProcessAssetsToChecks(sqlite)
      await retireSupplyAssets(sqlite)
      await reload()
      setNotice(`로컬 원본이 열렸습니다. VFS ${sqlite.vfsName}`)
    } catch (error) {
      setReady(false)
      setOpenFailed(true)
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      opening.current = false
    }
  }

  async function reload() {
    const [itemRows, warehouseRows, deptRows, nextState] = await Promise.all([
      loadItems(sqlite),
      sqlite.query<NamedRow>('select id, name from warehouses order by name'),
      sqlite.query<NamedRow>('select id, name from departments order by name'),
      loadStockState(sqlite),
    ])
    setItems(itemRows)
    setWarehouses(warehouseRows)
    setDepartments(deptRows)
    setState(nextState)
    setSelectedLine((prev) => {
      const visible = nextState.ledger.filter(isSupplyLedgerLine)
      if (prev) {
        const found = visible.find((line) => line.id === prev.id)
        if (found) return found
      }
      return visible[visible.length - 1] ?? null
    })
    const nextStockItems = supplyItems(itemRows)
    const suggested = suggestNextStockForm(
      nextState,
      orderId,
      nextStockItems.find((row) => row.id === itemId) ?? nextStockItems.find((row) => row.id === 'item-paper'),
    )
    applySuggestedForm(suggested?.action === 'convert_to_asset' ? null : suggested)
    if (!nextStockItems.some((row) => row.id === itemId) && nextStockItems[0]) setItemId(nextStockItems[0].id)
    if (!warehouseRows.some((row) => row.id === warehouseId) && warehouseRows[0]) {
      setWarehouseId(warehouseRows[0].id)
    }
    if (!departmentId && deptRows[0]) setDepartmentId(deptRows[0].id)
  }

  function applySuggestedForm(next: NextStockForm | null) {
    if (!next) {
      setAction('post_issue')
      setQty('1')
      return
    }
    setAction(next.action)
    setQty(next.qty)
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
    if (nextAction === 'post_receipt') {
      const remainingQty = orderRemaining(state, orderId)
      setQty(String(remainingQty > 0 ? remainingQty : 1))
      return
    }
    if (nextAction === 'post_issue' || nextAction === 'post_outbound') {
      const onHandQty = onHand(state, itemId, warehouseId)
      setQty(String(onHandQty > 0 ? Math.min(1, onHandQty) : 1))
      return
    }
    if (nextAction === 'post_return') setQty('1')
    if (nextAction === 'transfer_stock') setQty('2')
  }

  function buildCommand(nextOperationId: string): StockCommand {
    const quantity = Number(qty)
    switch (action) {
      case 'draft_order':
      case 'confirm_order':
        return { type: action, operationId: nextOperationId, orderId, itemId, qty: quantity }
      case 'post_receipt':
        return {
          type: action,
          operationId: nextOperationId,
          orderId,
          itemId,
          warehouseId,
          qty: quantity,
        }
      case 'post_direct_in':
      case 'post_outbound':
      case 'convert_to_asset':
        return { type: action, operationId: nextOperationId, itemId, warehouseId, qty: quantity }
      case 'post_issue':
        return {
          type: action,
          operationId: nextOperationId,
          itemId,
          warehouseId,
          qty: quantity,
          personName: personName.trim() || undefined,
          departmentId: departmentId.trim() || undefined,
        }
      case 'post_return':
        return {
          type: action,
          operationId: nextOperationId,
          itemId,
          warehouseId,
          qty: quantity,
          sourceOperationId,
        }
      case 'transfer_stock':
        return {
          type: action,
          operationId: nextOperationId,
          itemId,
          fromWarehouseId,
          toWarehouseId,
          qty: quantity,
        }
      case 'adjust_stock':
        return {
          type: action,
          operationId: nextOperationId,
          itemId,
          warehouseId,
          countedQty: quantity,
          reason,
        }
      case 'reverse_transaction':
        return { type: action, operationId: nextOperationId, sourceOperationId }
    }
  }

  async function applyRemaining() {
    if (!ready || !companyId || !state) return
    setMessage('')
    setSaving(true)
    const labels: string[] = []
    let current = state
    try {
      for (let step = 0; step < 8; step += 1) {
        const next = suggestNextStockForm(current, orderId)
        if (!next) break
        const nextOperationId = crypto.randomUUID()
        const result = await executeStockCommand(
          sqlite,
          commandFromSuggestion(next, nextOperationId, {
            orderId,
            itemId,
            warehouseId,
            fromWarehouseId,
            toWarehouseId,
          }),
        )
        current = result.state
        labels.push(`${ACTIONS.find((item) => item.id === next.action)?.label} ${next.qty}`)
        setLastOperationId(nextOperationId)
      }
      setNotice(labels.length ? `이어서 확정했습니다. ${labels.join(' → ')}` : '이어서 처리할 거래가 없습니다.')
      await reload()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
      await reload()
    } finally {
      setSaving(false)
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!ready || !companyId) return
    setMessage('')
    setSaving(true)
    const nextOperationId = operationId.trim() || crypto.randomUUID()
    try {
      const result = await executeStockCommand(sqlite, buildCommand(nextOperationId))
      setLastOperationId(nextOperationId)
      setOperationId('')
      setNotice(
        result.status === 'duplicate'
          ? `같은 operation_id 는 한 번만 반영됩니다. (${nextOperationId})`
          : `저장했습니다. (${ACTIONS.find((item) => item.id === action)?.label} · ${nextOperationId})`,
      )
      if (result.status === 'applied') {
        applySuggestedForm(suggestNextStockForm(result.state, orderId))
      }
      await reload()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="text-sm text-muted">세션을 확인하는 중입니다.</p>
  if (!configured) return <p className="text-sm text-muted">중앙 운영이 연결되지 않았습니다.</p>
  if (!user) {
    return (
      <p className="text-sm">
        구매·재고는 로그인 후 지정 PC에서 다룹니다.{' '}
        <Link className="text-accent underline" to="/login">
          로그인
        </Link>
      </p>
    )
  }

  const stockItems = supplyItems(items)
  const paperQty = state ? companyOnHand(state, itemId) : 0
  const remaining = state ? orderRemaining(state, orderId) : 0
  const suggested = state
    ? suggestNextStockForm(state, orderId, stockItems.find((row) => row.id === itemId))
    : null
  const nextForm = suggested?.action === 'convert_to_asset' ? null : suggested
  const inventory =
    state && stockItems.length && warehouses.length ? buildSupplyInventory(stockItems, warehouses, state) : []
  const selectedInventory = inventory.find((row) => row.itemId === itemId) ?? inventory[0]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">구매·재고</h1>
        <p className="mt-2 text-sm text-muted">
          복사용지처럼 쓰고 채우는 비품만 다룹니다. 창고에 자산화하지 않고, 가구·컴퓨터는 자산 메뉴에서 QR로 등록합니다.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <select
          className="rounded border border-line px-3 py-2 text-sm"
          value={companyId}
          onChange={(e) => {
            setReady(false)
            setOpenFailed(false)
            void openCompany(e.target.value, true)
          }}
        >
          <option value="">회사 선택</option>
          {companies.map((company) => (
            <option key={company.id} value={company.id}>
              {company.display_name} ({company.company_code})
            </option>
          ))}
        </select>
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
      </div>

      <section className="rounded-lg border border-line bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">현재고</h2>
            <p className="mt-1 text-sm text-muted">
              {selectedInventory ? (
                <>
                  {selectedInventory.itemName}{' '}
                  <strong className="text-ink tabular-nums">{selectedInventory.total}</strong>
                </>
              ) : (
                <>
                  비품 수량 <strong className="text-ink tabular-nums">{paperQty}</strong>
                </>
              )}
              {state?.orders.get(orderId) ? ` · 발주 ${orderId} 잔량 ${remaining}` : ''}
            </p>
          </div>
          <Link className="text-sm text-accent underline" to="/assets">
            가구·컴퓨터는 자산
          </Link>
        </div>
        {inventory.length ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full max-w-md text-left text-sm">
              <thead>
                <tr className="border-b border-line text-muted">
                  <th className="py-2 pr-4 font-medium">비품</th>
                  <th className="py-2 text-right font-medium">수량</th>
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
                      onClick={() => setItemId(row.itemId)}
                    >
                      <td className="py-2 pr-4 font-medium">{row.itemName}</td>
                      <td className="py-2 text-right font-semibold tabular-nums">{row.total}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted">
            {ready ? '비품 품목이 없습니다. 기준정보에서 복사용지처럼 재고 품목을 등록하세요.' : '회사 DB를 여는 중입니다.'}
          </p>
        )}
      </section>

      <section className="rounded-lg border border-line bg-card p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">비품 수불부</h2>
            <p className="mt-1 text-sm text-muted">
              사 온 비품이 얼마나 들어왔고 나갔는지만 보여 줍니다. 자산화·창고 이동은 비품 흐름이 아닙니다.
            </p>
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
        {state?.orders.size ? (
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
            {[...state.orders.values()].map((order) => (
              <li key={order.id}>
                발주 {order.id} · {items.find((item) => item.id === order.itemId)?.name ?? order.itemId}{' '}
                {order.qty} · {order.status === 'draft' ? '초안' : '확정'} · 잔량{' '}
                {orderRemaining(state, order.id)}
              </li>
            ))}
          </ul>
        ) : null}
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
      </section>

      {nextForm ? (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-accent bg-accent-soft px-5 py-4">
          <p className="text-sm text-accent">{nextForm.hint}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              form="stock-command"
              disabled={!ready || saving}
              className="rounded bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              onClick={(event) => {
                if (!nextForm) return
                if (action === nextForm.action && qty === nextForm.qty) return
                event.preventDefault()
                flushSync(() => applySuggestedForm(nextForm))
                const form = document.getElementById('stock-command')
                if (form instanceof HTMLFormElement) form.requestSubmit()
              }}
            >
              {ACTIONS.find((item) => item.id === nextForm.action)?.label} {nextForm.qty}
            </button>
              <button
                type="button"
                disabled={!ready || saving}
                className="rounded border border-accent px-4 py-2 text-sm font-semibold text-accent disabled:opacity-50"
                onClick={() => void applyRemaining()}
              >
                이어서 모두 확정
              </button>
          </div>
        </section>
      ) : null}

      <form
        id="stock-command"
        className="grid max-w-3xl gap-3 rounded-lg border border-line bg-card p-5"
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
              {ACTIONS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          {action !== 'reverse_transaction' ? (
            <label className="w-28 text-sm">
              {action === 'adjust_stock' ? '실사 수량' : '수량'}
              <input
                className="mt-1 w-full rounded border border-line px-3 py-2"
                type="number"
                min="0"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
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
          {action === 'draft_order' || action === 'confirm_order' || action === 'post_receipt' ? (
            <label className="text-sm">
              발주 번호
              <input
                className="mt-1 w-full rounded border border-line px-3 py-2"
                value={orderId}
                onChange={(e) => setOrderId(e.target.value)}
              />
            </label>
          ) : null}
          {action !== 'reverse_transaction' ? (
            <label className="text-sm">
              품목
              <select
                className="mt-1 w-full rounded border border-line px-3 py-2"
                value={itemId}
                onChange={(e) => setItemId(e.target.value)}
              >
                {stockItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
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
  )
}
