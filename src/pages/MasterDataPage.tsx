import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { CompanySqlite } from '../lib/sqlite/client'
import { getSupabase, type CompanyRow } from '../lib/supabase'

type NamedRow = { id: string; name: string }
type FieldRow = { entity: string; key: string; label: string }

const sqlite = new CompanySqlite()
const TABS = [
  { id: 'departments', label: '부서' },
  { id: 'employees', label: '직원' },
  { id: 'items', label: '품목' },
  { id: 'partners', label: '거래처' },
  { id: 'warehouses', label: '창고' },
  { id: 'fields', label: '필드' },
] as const

export function MasterDataPage() {
  const { configured, loading, user } = useAuth()
  const [companies, setCompanies] = useState<CompanyRow[]>([])
  const [companyId, setCompanyId] = useState('')
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('departments')
  const [rows, setRows] = useState<NamedRow[]>([])
  const [fields, setFields] = useState<FieldRow[]>([])
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  const [ready, setReady] = useState(false)

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

  async function openCompany(nextId: string) {
    setCompanyId(nextId)
    setMessage('')
    await sqlite.open(nextId)
    setReady(sqlite.persistOk)
    if (!sqlite.persistOk) {
      setMessage('이 브라우저에서 영속 DB를 열 수 없습니다. 지정 Chrome에서 초기 설정을 먼저 하세요.')
      return
    }
    await reload(tab)
  }

  async function reload(nextTab = tab) {
    const defs = await sqlite.query<FieldRow>(
      'select entity, key, label from custom_field_defs order by entity, key',
    )
    setFields(defs)
    if (nextTab === 'fields') return
    const named = await sqlite.query<NamedRow>(
      `select id, name from ${nextTab} order by name`,
    )
    setRows(named)
  }

  useEffect(() => {
    if (!companyId || !ready) return
    void reload(tab)
  }, [tab, ready, companyId])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!ready || !name.trim()) return
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    if (tab === 'fields') {
      await sqlite.exec('insert or replace into custom_field_defs(entity, key, label) values(?, ?, ?)', [
        'employee',
        id.slice(0, 8),
        name.trim(),
      ])
    } else {
      await sqlite.exec(`insert into ${tab}(id, name, created_at) values(?, ?, ?)`, [id, name.trim(), now])
    }
    setName('')
    await reload()
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">기준정보</h1>
        <p className="mt-2 text-sm text-muted">
          회사별 로컬 원본에만 저장합니다. 다른 회사 화면·라벨을 바꾸지 않습니다.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <select
          className="rounded border border-line px-3 py-2 text-sm"
          value={companyId}
          onChange={(e) => void openCompany(e.target.value)}
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
          onClick={() => void openCompany(companyId)}
        >
          이 회사 DB 열기
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
      <form className="flex max-w-xl gap-2" onSubmit={onSubmit}>
        <input
          className="flex-1 rounded border border-line px-3 py-2 text-sm"
          placeholder={tab === 'fields' ? '직원 필드 라벨' : '이름'}
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
      {message ? <p className="text-sm text-danger">{message}</p> : null}
      {tab === 'fields' ? (
        <ul className="space-y-1 text-sm">
          {fields.map((field) => (
            <li key={`${field.entity}-${field.key}`}>
              {field.entity} · {field.key} · {field.label}
            </li>
          ))}
        </ul>
      ) : (
        <ul className="space-y-1 text-sm">
          {rows.map((row) => (
            <li key={row.id}>{row.name}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
