import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { writeDefaultMaster } from '../lib/master/book'
import { retireSupplyAssets } from '../lib/asset/retireSupplies'
import {
  assertMasterTable,
  fieldEntityFromTable,
  masterInsertStatement,
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
}
type FieldRow = { entity: string; key: string; label: string }
type TabId = MasterTable | 'fields'
type ListTileRow = { id: string; name: string; meta?: string; badge?: string }

function nameInitial(name: string) {
  return Array.from(name.trim())[0] || '?'
}

function itemKindLabel(row: NamedRow) {
  if (row.asset_managed === 1) return '회사 자산'
  if (row.stock_managed === 1) return '비품'
  return '품목'
}

function employeeTile(row: NamedRow): ListTileRow {
  return {
    id: row.id,
    name: row.name,
    meta: row.title?.trim() || undefined,
    badge: row.left_at ? '퇴사' : undefined,
  }
}

function itemTile(row: NamedRow): ListTileRow {
  return {
    id: row.id,
    name: row.name,
  }
}

function ListTile({ name, meta, badge }: { name: string; meta?: string; badge?: string }) {
  return (
    <li className="flex items-center gap-3 rounded-lg border border-line px-3 py-2.5">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent">
        {nameInitial(name)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="truncate font-medium">{name}</p>
          {badge ? (
            <span className="shrink-0 rounded bg-accent-soft px-1.5 py-0.5 text-[11px] font-medium text-accent">
              {badge}
            </span>
          ) : null}
        </div>
        {meta ? <p className="mt-0.5 truncate text-xs text-muted">{meta}</p> : null}
      </div>
    </li>
  )
}

function TileGrid({ rows }: { rows: ListTileRow[] }) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {rows.map((row) => (
        <ListTile key={row.id} name={row.name} meta={row.meta} badge={row.badge} />
      ))}
    </ul>
  )
}

function GroupedTiles({ groups }: { groups: { title: string; rows: ListTileRow[] }[] }) {
  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <section key={group.title}>
          <h3 className="mb-2 text-xs font-semibold text-muted">
            {group.title} {group.rows.length}
          </h3>
          <TileGrid rows={group.rows} />
        </section>
      ))}
    </div>
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
  const [rows, setRows] = useState<NamedRow[]>([])
  const [departments, setDepartments] = useState<NamedRow[]>([])
  const [fields, setFields] = useState<FieldRow[]>([])
  const [name, setName] = useState('')
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
              'select id, name, stock_managed, asset_managed from items order by name',
            )
          : await sqlite.query<NamedRow>(`select id, name from ${nextTab} order by name`)
    setRows(named)
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
        const row = {
          id: crypto.randomUUID(),
          name: name.trim(),
          createdAt: new Date().toISOString(),
          departmentId: tab === 'employees' ? departmentId || undefined : undefined,
        }
        const stmt = masterInsertStatement(tab, row)
        const result = await sqlite.runOnce(operationId, async () => {
          await sqlite.exec(stmt.sql, stmt.params)
          return row
        })
        setNotice(`${TABS.find((item) => item.id === tab)?.label} 저장 (${result.status})`)
      }
      setName('')
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
  const employeeGroups = [
    ...departments.map((dept) => ({
      title: dept.name,
      rows: rows.filter((row) => row.department_id === dept.id).map(employeeTile),
    })),
    {
      title: '부서 없음',
      rows: rows
        .filter(
          (row) => !row.department_id || !departments.some((dept) => dept.id === row.department_id),
        )
        .map(employeeTile),
    },
  ].filter((group) => group.rows.length)
  const itemGroups = [
    { title: '비품', rows: rows.filter((row) => itemKindLabel(row) === '비품').map(itemTile) },
    {
      title: '회사 자산',
      rows: rows.filter((row) => itemKindLabel(row) === '회사 자산').map(itemTile),
    },
    { title: '기타', rows: rows.filter((row) => itemKindLabel(row) === '품목').map(itemTile) },
  ].filter((group) => group.rows.length)
  const namedTiles: ListTileRow[] = rows.map((row) => ({ id: row.id, name: row.name }))
  const fieldGroups = FIELD_ENTITIES.map((entity) => ({
    title: entity.label,
    rows: fields
      .filter((field) => field.entity === entity.id)
      .map((field) => ({
        id: `${field.entity}-${field.key}`,
        name: field.label,
        meta: field.key,
        badge: entity.label,
      })),
  })).filter((group) => group.rows.length)

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
      <div className="grid min-h-0 gap-4 lg:grid-cols-[minmax(18rem,22rem)_minmax(0,1fr)] lg:items-start">
      <section className="rounded-lg border border-line bg-card p-4">
      <div className="flex flex-wrap gap-2 text-sm">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={tab === item.id ? 'font-semibold text-accent' : 'text-muted'}
            onClick={() => {
              setRows([])
              setTab(item.id)
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
      <form className="mt-3 flex flex-wrap gap-2" onSubmit={onSubmit}>
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
      {tab === 'fields' ? (
        fields.length ? (
          <>
            <h2 className="mb-3 text-base font-semibold">필드 {fields.length}</h2>
            <GroupedTiles groups={fieldGroups} />
          </>
        ) : (
          <p className="text-sm text-muted">아직 필드가 없습니다.</p>
        )
      ) : rows.length ? (
        <>
          <h2 className="mb-3 text-base font-semibold">
            {tabLabel} {rows.length}
          </h2>
          {tab === 'employees' ? (
            <GroupedTiles groups={employeeGroups} />
          ) : tab === 'items' ? (
            <GroupedTiles groups={itemGroups} />
          ) : (
            <TileGrid rows={namedTiles} />
          )}
        </>
      ) : (
        <p className="text-sm text-muted">
          {ready ? '아직 항목이 없습니다. 왼쪽에서 추가하세요.' : '회사 DB를 여는 중입니다.'}
        </p>
      )}
      </section>
      </div>
    </div>
  )
}
