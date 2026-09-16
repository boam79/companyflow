import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { getCompanySqlite } from '../lib/sqlite/instance'
import { executeStockCommand, ensureDefaultStockMaster, loadStockState } from '../lib/stock/persist'
import { companyOnHand, onHand, type StockCommand, type StockState } from '../lib/stock/engine'
import { getSupabase, type CompanyRow } from '../lib/supabase'

type NamedRow = { id: string; name: string }
type ActionType = StockCommand['type']

const sqlite = getCompanySqlite()
const ACTIONS: { id: ActionType; label: string }[] = [
  { id: 'confirm_order', label: '발주 확정' },
  { id: 'post_receipt', label: '수령' },
  { id: 'post_issue', label: '반출' },
  { id: 'post_return', label: '반납' },
  { id: 'transfer_stock', label: '창고 이동' },
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
  const [items, setItems] = useState<NamedRow[]>([])
  const [warehouses, setWarehouses] = useState<NamedRow[]>([])
  const [departments, setDepartments] = useState<NamedRow[]>([])
  const [state, setState] = useState<StockState | null>(null)
  const [action, setAction] = useState<ActionType>('confirm_order')
  const [operationId, setOperationId] = useState('')
  const [orderId, setOrderId] = useState('ord-paper')
  const [itemId, setItemId] = useState('item-paper')
  const [warehouseId, setWarehouseId] = useState('wh-main')
  const [fromWarehouseId, setFromWarehouseId] = useState('wh-main')
  const [toWarehouseId, setToWarehouseId] = useState('wh-sub')
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
      sqlite.query<NamedRow>('select id, name from items order by name'),
      sqlite.query<NamedRow>('select id, name from warehouses order by name'),
      sqlite.query<NamedRow>('select id, name from departments order by name'),
      loadStockState(sqlite),
    ])
    setItems(itemRows)
    setWarehouses(warehouseRows)
    setDepartments(deptRows)
    setState(nextState)
    if (!itemRows.some((row) => row.id === itemId) && itemRows[0]) setItemId(itemRows[0].id)
    if (!warehouseRows.some((row) => row.id === warehouseId) && warehouseRows[0]) {
      setWarehouseId(warehouseRows[0].id)
    }
    if (!departmentId && deptRows[0]) setDepartmentId(deptRows[0].id)
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

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!ready || !companyId) return
    setMessage('')
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
      await reload()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
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

  const paperQty = state ? companyOnHand(state, itemId) : 0
  const warehouseBalances =
    state && items.length && warehouses.length
      ? items.flatMap((item) =>
          warehouses.map((warehouse) => ({
            item,
            warehouse,
            qty: onHand(state, item.id, warehouse.id),
          })),
        )
      : []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">구매·재고</h1>
        <p className="mt-2 text-sm text-muted">
          확정 원장만 현재고에 반영합니다. 복사용지 10 발주 → 수령 6+4 → 반출 3 → 반납 1 이면 회사
          현재고는 8이어야 합니다.
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
        <h2 className="text-lg font-semibold">현재고</h2>
        <p className="mt-1 text-sm text-muted">
          선택 품목 회사 합계 <strong>{paperQty}</strong>
        </p>
        {warehouseBalances.length ? (
          <table className="mt-3 w-full text-left text-sm">
            <thead>
              <tr className="text-muted">
                <th className="py-1 font-medium">품목</th>
                <th className="py-1 font-medium">창고</th>
                <th className="py-1 font-medium">수량</th>
              </tr>
            </thead>
            <tbody>
              {warehouseBalances.map((row) => (
                <tr key={`${row.item.id}-${row.warehouse.id}`}>
                  <td className="py-1">{row.item.name}</td>
                  <td className="py-1">{row.warehouse.name}</td>
                  <td className="py-1">{row.qty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="mt-2 text-sm text-muted">
            {ready ? '품목·창고가 없습니다.' : '회사 DB를 여는 중입니다.'}
          </p>
        )}
      </section>

      <form className="grid max-w-3xl gap-3 rounded-lg border border-line bg-card p-5" onSubmit={onSubmit}>
        <label className="text-sm">
          명령
          <select
            className="mt-1 w-full rounded border border-line px-3 py-2"
            value={action}
            onChange={(e) => setAction(e.target.value as ActionType)}
          >
            {ACTIONS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          operation_id (비우면 새로 발급, 같게 넣으면 중복 확인)
          <input
            className="mt-1 w-full rounded border border-line px-3 py-2"
            value={operationId}
            onChange={(e) => setOperationId(e.target.value)}
            placeholder={lastOperationId || '자동 발급'}
          />
        </label>
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
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {action === 'transfer_stock' ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              보내는 창고
              <select
                className="mt-1 w-full rounded border border-line px-3 py-2"
                value={fromWarehouseId}
                onChange={(e) => setFromWarehouseId(e.target.value)}
              >
                {warehouses.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              받는 창고
              <select
                className="mt-1 w-full rounded border border-line px-3 py-2"
                value={toWarehouseId}
                onChange={(e) => setToWarehouseId(e.target.value)}
              >
                {warehouses.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : action !== 'reverse_transaction' &&
          action !== 'draft_order' &&
          action !== 'confirm_order' ? (
          <label className="text-sm">
            창고
            <select
              className="mt-1 w-full rounded border border-line px-3 py-2"
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
            >
              {warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {action !== 'reverse_transaction' ? (
          <label className="text-sm">
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
        {action === 'post_return' || action === 'reverse_transaction' ? (
          <label className="text-sm">
            원거래 operation_id
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
        <button
          type="submit"
          disabled={!ready}
          className="rounded bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          확정
        </button>
      </form>
      {notice ? <p className="text-sm text-ok">{notice}</p> : null}
      {message ? <p className="text-sm text-danger">{message}</p> : null}

      <section className="grid gap-6 md:grid-cols-2">
        <div>
          <h2 className="text-lg font-semibold">발주</h2>
          {state?.orders.size ? (
            <ul className="mt-2 space-y-1 text-sm">
              {[...state.orders.values()].map((order) => (
                <li key={order.id}>
                  {order.id} · {items.find((item) => item.id === order.itemId)?.name ?? order.itemId} ·{' '}
                  {order.qty} · {order.status === 'draft' ? '초안' : '확정'}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted">아직 발주가 없습니다.</p>
          )}
        </div>
        <div>
          <h2 className="text-lg font-semibold">원장</h2>
          {state?.ledger.length ? (
            <ul className="mt-2 space-y-1 text-sm">
              {state.ledger.map((line) => (
                <li key={line.id}>
                  {line.txnType} · {line.qtyDelta > 0 ? '+' : ''}
                  {line.qtyDelta} · {line.operationId}
                  {line.personName ? ` · ${line.personName}` : ''}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted">아직 원장이 없습니다.</p>
          )}
        </div>
      </section>
    </div>
  )
}
