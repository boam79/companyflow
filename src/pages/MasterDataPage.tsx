import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { writeDefaultMaster } from '../lib/master/book'
import { retireSupplyAssets } from '../lib/asset/retireSupplies'
import {
  assertMasterTable,
  assertUniqueItemCode,
  assertUniqueItemName,
  fieldEntityFromTable,
  itemCatalogUpdateStatement,
  masterInsertStatement,
  PURCHASE_KINDS,
  purchaseKindLabel,
  type MasterFieldEntity,
  type MasterTable,
} from '../lib/master/commands'
import { getCompanySqlite } from '../lib/sqlite/instance'
import { getSupabase, type CompanyRow } from '../lib/supabase'

type NamedRow = {
  id: string
  name: string
  department_id?: string | null
  title?: string | null
  left_at?: string | null
  stock_managed?: number | null
  asset_managed?: number | null
  min_stock?: number | null
  code?: string | null
  unit?: string | null
  purchase_kind?: string | null
}
type FieldRow = { entity: string; key: string; label: string }
type TabId = MasterTable | 'fields'
type TableColumn = { key: string; label: string; muted?: boolean }
type TableRow = { id: string } & Record<string, string>

function itemKindLabel(row: NamedRow) {
  if (row.asset_managed === 1) return '회사 자산'
  if (row.stock_managed === 1) return '비품'
  return '품목'
}

function MasterTable({
  columns,
  rows,
  selectedId,
  onRowClick,
}: {
  columns: TableColumn[]
  rows: TableRow[]
  selectedId?: string
  onRowClick?: (id: string) => void
}) {
  return (
    <table className="w-full text-left text-sm">
      <thead>
        <tr className="sticky top-0 border-b border-line bg-card text-muted">
          {columns.map((column) => (
            <th key={column.key} className="py-1.5 pr-3 font-medium">
              {column.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            key={row.id}
            className={`border-b border-line/70 last:border-b-0 ${
              onRowClick ? 'cursor-pointer hover:bg-paper' : ''
            } ${selectedId === row.id ? 'bg-accent-soft' : ''}`}
            onClick={() => onRowClick?.(row.id)}
          >
            {columns.map((column, index) => (
              <td
                key={column.key}
                className={`whitespace-nowrap py-2 pr-4 ${index === 0 ? 'font-medium' : ''} ${
                  column.muted ? 'text-muted' : ''
                }`}
              >
                {row[column.key] || '—'}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

const sqlite = getCompanySqlite()
const TABS: { id: TabId; label: string }[] = [
  { id: 'departments', label: '부서' },
  { id: 'employees', label: '직원' },
  { id: 'items', label: '품목' },
  { id: 'partners', label: '거래처' },
  { id: 'warehouses', label: '창고' },
  { id: 'fields', label: '필드' },
]
const FIELD_ENTITIES: { id: MasterFieldEntity; label: string }[] = [
  { id: 'employee', label: '직원' },
  { id: 'item', label: '품목' },
  { id: 'partner', label: '거래처' },
  { id: 'department', label: '부서' },
  { id: 'warehouse', label: '창고' },
]

export function MasterDataPage() {
  const { configured, loading, user } = useAuth()
  const [companies, setCompanies] = useState<CompanyRow[]>([])
  const [companyId, setCompanyId] = useState('')
  const [tab, setTab] = useState<TabId>('departments')
  const [listTab, setListTab] = useState<TabId>('departments')
  const [rows, setRows] = useState<NamedRow[]>([])
  const [departments, setDepartments] = useState<NamedRow[]>([])
  const [fields, setFields] = useState<FieldRow[]>([])
  const [name, setName] = useState('')
  const [minStock, setMinStock] = useState('0')
  const [itemCode, setItemCode] = useState('')
  const [itemUnit, setItemUnit] = useState('개')
  const [purchaseKind, setPurchaseKind] = useState('supply')
  const [selectedItemId, setSelectedItemId] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [fieldEntity, setFieldEntity] = useState<MasterFieldEntity>('employee')
  const [fieldKey, setFieldKey] = useState('employee_no')
  const [message, setMessage] = useState('')
  const [notice, setNotice] = useState('')
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
      await writeDefaultMaster(sqlite)
      await retireSupplyAssets(sqlite)
      setNotice(`로컬 원본이 열렸습니다. VFS ${sqlite.vfsName}`)
      await reload(tab)
    } catch (error) {
      setReady(false)
      setOpenFailed(true)
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      opening.current = false
    }
  }

  async function reload(nextTab = tab) {
    const defs = await sqlite.query<FieldRow>(
      'select entity, key, label from custom_field_defs order by entity, key',
    )
    setFields(defs)
    const deptRows = await sqlite.query<NamedRow>('select id, name from departments order by name')
    setDepartments(deptRows)
    if (!departmentId && deptRows[0]) setDepartmentId(deptRows[0].id)
    if (nextTab === 'fields') {
      setRows([])
      setListTab(nextTab)
      return
    }
    assertMasterTable(nextTab)
    const named =
      nextTab === 'employees'
        ? await sqlite.query<NamedRow>(
            'select id, name, department_id, title, left_at from employees order by name',
          )
        : nextTab === 'items'
          ? await sqlite.query<NamedRow>(
              'select id, name, stock_managed, asset_managed, min_stock, code, unit, purchase_kind from items where coalesce(active, 1) = 1 order by name',
            )
          : await sqlite.query<NamedRow>(`select id, name from ${nextTab} order by name`)
    setRows(named)
    setListTab(nextTab)
  }

  useEffect(() => {
    if (!companyId || !ready) return
    void reload(tab)
  }, [tab, ready, companyId])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!ready || !name.trim()) return
    setMessage('')
    const operationId = crypto.randomUUID()
    try {
      if (tab === 'fields') {
        const entity = fieldEntity
        const key = fieldKey.trim() || 'custom_field'
        const result = await sqlite.runOnce(operationId, async () => {
          await sqlite.exec(
            'insert or replace into custom_field_defs(entity, key, label) values(?, ?, ?)',
            [entity, key, name.trim()],
          )
          return { entity, key, label: name.trim() }
        })
        setNotice(`필드 저장 (${result.status})`)
      } else {
        assertMasterTable(tab)
        if (tab === 'items') {
          assertUniqueItemName(name, rows)
          assertUniqueItemCode(itemCode, rows)
        }
        const row = {
          id: crypto.randomUUID(),
          name: name.trim(),
          createdAt: new Date().toISOString(),
          departmentId: tab === 'employees' ? departmentId || undefined : undefined,
          minStock: tab === 'items' ? Number(minStock) || 0 : undefined,
          code: tab === 'items' ? itemCode : undefined,
          unit: tab === 'items' ? itemUnit : undefined,
          purchaseKind: tab === 'items' ? purchaseKind : undefined,
        }
        const stmt = masterInsertStatement(tab, row)
        const result = await sqlite.runOnce(operationId, async () => {
          await sqlite.exec(stmt.sql, stmt.params)
          return row
        })
        setNotice(`${TABS.find((item) => item.id === tab)?.label} 저장 (${result.status})`)
      }
      setName('')
      setMinStock('0')
      setItemCode('')
      setItemUnit('개')
      setPurchaseKind('supply')
      setSelectedItemId('')
      await reload()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    }
  }

  async function saveItemCatalog() {
    if (!ready || !selectedItemId) return
    setMessage('')
    const operationId = crypto.randomUUID()
    try {
      const stmt = itemCatalogUpdateStatement({
        id: selectedItemId,
        name,
        code: itemCode,
        unit: itemUnit,
        minStock: Number(minStock) || 0,
        purchaseKind,
      })
      assertUniqueItemName(name, rows, selectedItemId)
      assertUniqueItemCode(itemCode, rows, selectedItemId)
      const result = await sqlite.runOnce(operationId, async () => {
        await sqlite.exec(stmt.sql, stmt.params)
        return { itemId: selectedItemId, name: stmt.params[0], code: stmt.params[1] }
      })
      setNotice(`품목 저장 (${result.status})`)
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
        기준정보는 로그인 후 지정 PC에서 다룹니다.{' '}
        <Link className="text-accent underline" to="/login">
          로그인
        </Link>
      </p>
    )
  }

  const fieldHint =
    tab === 'fields'
      ? '라벨'
      : tab === 'employees'
        ? '직원 이름'
        : `${TABS.find((item) => item.id === tab)?.label} 이름`
  const tabLabel = TABS.find((item) => item.id === tab)?.label ?? '목록'
  const table =
    tab === 'employees'
      ? {
          columns: [
            { key: 'name', label: '이름' },
            { key: 'department', label: '부서', muted: true },
            { key: 'title', label: '직위', muted: true },
            { key: 'status', label: '상태', muted: true },
          ],
          rows: rows.map((row) => ({
            id: row.id,
            name: row.name,
            department: departments.find((dept) => dept.id === row.department_id)?.name ?? '',
            title: row.title?.trim() ?? '',
            status: row.left_at ? '퇴사' : '재직',
          })),
        }
      : tab === 'items'
        ? {
            columns: [
              { key: 'code', label: '코드', muted: true },
              { key: 'name', label: '이름' },
              { key: 'kind', label: '구분', muted: true },
              { key: 'purchase', label: '구매', muted: true },
              { key: 'unit', label: '단위', muted: true },
              { key: 'minStock', label: '최소재고', muted: true },
            ],
            rows: [...rows]
              .sort(
                (a, b) =>
                  itemKindLabel(a).localeCompare(itemKindLabel(b), 'ko') ||
                  a.name.localeCompare(b.name, 'ko'),
              )
              .map((row) => ({
                id: row.id,
                code: row.code?.trim() ?? '',
                name: row.name,
                kind: itemKindLabel(row),
                purchase: itemKindLabel(row) === '회사 자산' ? '' : purchaseKindLabel(row.purchase_kind),
                unit: row.unit?.trim() || '개',
                minStock: itemKindLabel(row) === '비품' ? String(row.min_stock ?? 0) : '',
              })),
          }
        : tab === 'fields'
          ? {
              columns: [
                { key: 'entity', label: '대상', muted: true },
                { key: 'key', label: '키', muted: true },
                { key: 'label', label: '라벨' },
              ],
              rows: fields.map((field) => ({
                id: `${field.entity}-${field.key}`,
                entity: FIELD_ENTITIES.find((item) => item.id === field.entity)?.label ?? field.entity,
                key: field.key,
                label: field.label,
              })),
            }
          : {
              columns: [{ key: 'name', label: '이름' }],
              rows: rows.map((row) => ({ id: row.id, name: row.name })),
            }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">기준정보</h1>
          <p className="mt-1 text-sm text-muted">
            회사별 로컬 원본에만 저장합니다. 같은 추가는 한 번만 반영됩니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
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
      </div>
      <div className="grid min-h-0 gap-4 lg:grid-cols-[minmax(20rem,24rem)_minmax(0,1fr)] lg:items-start">
      <section className="rounded-lg border border-line bg-card p-4">
      <div className="flex flex-wrap gap-2 text-sm">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={tab === item.id ? 'font-semibold text-accent' : 'text-muted'}
            onClick={() => {
              setSelectedItemId('')
              setMinStock('0')
              setItemCode('')
              setItemUnit('개')
              setPurchaseKind('supply')
              setTab(item.id)
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
      <form className="mt-3 grid gap-2" onSubmit={onSubmit}>
        {tab === 'items' ? (
          <>
            <label className="text-sm">
              이름
              <input
                className="mt-1 w-full rounded border border-line px-3 py-2 text-sm"
                placeholder="품목 이름"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-sm">
                코드
                <input
                  className="mt-1 w-full rounded border border-line px-3 py-2 text-sm"
                  placeholder="PAPER"
                  value={itemCode}
                  onChange={(e) => setItemCode(e.target.value)}
                />
              </label>
              <label className="text-sm">
                단위
                <input
                  className="mt-1 w-full rounded border border-line px-3 py-2 text-sm"
                  placeholder="개"
                  value={itemUnit}
                  onChange={(e) => setItemUnit(e.target.value)}
                />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-sm">
                최소재고
                <input
                  type="number"
                  min="0"
                  step="1"
                  className="mt-1 w-full rounded border border-line px-3 py-2 text-sm"
                  value={minStock}
                  onChange={(e) => setMinStock(e.target.value)}
                />
              </label>
              <label className="text-sm">
                구매 구분
                <select
                  className="mt-1 w-full rounded border border-line px-3 py-2 text-sm"
                  value={purchaseKind}
                  onChange={(e) => setPurchaseKind(e.target.value)}
                >
                  {PURCHASE_KINDS.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={!ready}
                className="rounded bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                추가
              </button>
              <button
                type="button"
                disabled={!ready || !selectedItemId}
                className="rounded border border-line px-4 py-2 text-sm font-semibold disabled:opacity-50"
                onClick={() => void saveItemCatalog()}
              >
                품목 저장
              </button>
            </div>
          </>
        ) : (
          <>
        {tab === 'fields' ? (
          <>
            <select
              className="rounded border border-line px-3 py-2 text-sm"
              value={fieldEntity}
              onChange={(e) => setFieldEntity(e.target.value as MasterFieldEntity)}
            >
              {FIELD_ENTITIES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
            <input
              className="w-40 rounded border border-line px-3 py-2 text-sm"
              placeholder="필드 키"
              value={fieldKey}
              onChange={(e) => setFieldKey(e.target.value)}
            />
          </>
        ) : null}
        {tab === 'employees' ? (
          <select
            className="rounded border border-line px-3 py-2 text-sm"
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
          >
            {departments.map((dept) => (
              <option key={dept.id} value={dept.id}>
                {dept.name}
              </option>
            ))}
          </select>
        ) : null}
        <div className="flex flex-wrap gap-2">
        <input
          className="min-w-48 flex-1 rounded border border-line px-3 py-2 text-sm"
          placeholder={fieldHint}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button
          type="submit"
          disabled={!ready}
          className="rounded bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          추가
        </button>
        </div>
          </>
        )}
      </form>
      {notice ? <p className="text-sm text-ok">{notice}</p> : null}
      {message ? <p className="text-sm text-danger">{message}</p> : null}
      {tab !== 'fields' ? (
        <p className="mt-3 text-xs text-muted">
          이 탭의 기본 필드 엔티티는 {fieldEntityFromTable(tab)} 입니다.
        </p>
      ) : null}
      </section>
      <section className="max-h-[calc(100svh-10rem)] overflow-auto rounded-lg border border-line bg-card p-4">
      {tab === listTab && (tab === 'fields' ? fields.length : rows.length) ? (
        <>
          <h2 className="mb-2 text-base font-semibold">
            {tabLabel} {tab === 'fields' ? fields.length : rows.length}
          </h2>
          <MasterTable
            columns={table.columns}
            rows={table.rows}
            selectedId={tab === 'items' ? selectedItemId : undefined}
            onRowClick={
              tab === 'items'
                ? (id) => {
                    const row = rows.find((item) => item.id === id)
                    setSelectedItemId(id)
                    setName(row?.name ?? '')
                    setItemCode(row?.code ?? '')
                    setItemUnit(row?.unit?.trim() || '개')
                    setPurchaseKind(row?.purchase_kind === 'material' || row?.purchase_kind === 'service' ? row.purchase_kind : 'supply')
                    setMinStock(String(row?.min_stock ?? 0))
                    setMessage('')
                    setNotice('')
                  }
                : undefined
            }
          />
        </>
      ) : (
        <p className="text-sm text-muted">
          {!ready
            ? '회사 DB를 여는 중입니다.'
            : tab !== listTab
              ? '목록을 불러오는 중입니다.'
              : '아직 항목이 없습니다. 왼쪽에서 추가하세요.'}
        </p>
      )}
      </section>
      </div>
    </div>
  )
}
