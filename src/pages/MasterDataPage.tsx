import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import {
  assertMasterTable,
  fieldEntityFromTable,
  masterInsertStatement,
  type MasterFieldEntity,
  type MasterTable,
} from '../lib/master/commands'
import { CompanySqlite } from '../lib/sqlite/client'
import { getSupabase, type CompanyRow } from '../lib/supabase'

type NamedRow = { id: string; name: string; department_id?: string | null }
type FieldRow = { entity: string; key: string; label: string }
type TabId = MasterTable | 'fields'

const sqlite = new CompanySqlite()
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

  async function openCompany(nextId: string) {
    opening.current = true
    setCompanyId(nextId)
    setMessage('')
    setNotice('')
    setOpenFailed(false)
    try {
      await sqlite.open(nextId)
      setReady(sqlite.persistOk)
      if (!sqlite.persistOk) {
        setOpenFailed(true)
        setMessage('이 브라우저에서 영속 DB를 열 수 없습니다. 지정 Chrome에서 초기 설정을 먼저 하세요.')
        return
      }
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
            'select id, name, department_id from employees order by name',
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">기준정보</h1>
        <p className="mt-2 text-sm text-muted">
          회사별 로컬 원본에만 저장합니다. 같은 추가는 한 번만 반영됩니다.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <select
          className="rounded border border-line px-3 py-2 text-sm"
          value={companyId}
          onChange={(e) => {
            setReady(false)
            setOpenFailed(false)
            void openCompany(e.target.value)
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
            void openCompany(companyId)
          }}
        >
          이 회사 DB 다시 열기
        </button>
      </div>
      <div className="flex flex-wrap gap-2 text-sm">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={tab === item.id ? 'font-semibold text-accent' : 'text-muted'}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <form className="flex max-w-3xl flex-wrap gap-2" onSubmit={onSubmit}>
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
      {tab === 'fields' ? (
        fields.length ? (
          <ul className="space-y-1 text-sm">
            {fields.map((field) => (
              <li key={`${field.entity}-${field.key}`}>
                {field.entity} · {field.key} · {field.label}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">아직 필드가 없습니다.</p>
        )
      ) : rows.length ? (
        <ul className="space-y-1 text-sm">
          {rows.map((row) => (
            <li key={row.id}>
              {row.name}
              {tab === 'employees' && row.department_id
                ? ` · ${departments.find((dept) => dept.id === row.department_id)?.name ?? ''}`
                : ''}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">
          {ready ? '아직 항목이 없습니다. 위에서 추가하세요.' : '회사 DB를 여는 중입니다.'}
        </p>
      )}
      {tab !== 'fields' ? (
        <p className="text-xs text-muted">
          이 탭의 기본 필드 엔티티는 {fieldEntityFromTable(tab)} 입니다.
        </p>
      ) : null}
    </div>
  )
}
