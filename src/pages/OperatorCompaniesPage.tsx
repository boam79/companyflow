import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ProcessedOperations } from '../lib/idempotency'
import { useAuth } from '../lib/AuthContext'
import { getSupabase, type CompanyRow } from '../lib/supabase'

type CreateState = {
  name: string
  code: string
  adminEmail: string
  message: string
  error: boolean
}

const createOps = new ProcessedOperations()

export function OperatorCompaniesPage() {
  const { configured, loading, user, operator } = useAuth()
  const [form, setForm] = useState<CreateState>({
    name: '',
    code: '',
    adminEmail: '',
    message: '',
    error: false,
  })
  const [companies, setCompanies] = useState<CompanyRow[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!operator) return
    const client = getSupabase()
    if (!client) return
    let cancelled = false
    void client
      .from('companies')
      .select('id, display_name, company_code, registration_status')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          setForm((prev) => ({ ...prev, error: true, message: error.message }))
          return
        }
        setCompanies((data ?? []) as CompanyRow[])
      })
    return () => {
      cancelled = true
    }
  }, [operator])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const client = getSupabase()
    if (!client || !operator) return
    setBusy(true)
    const operationId = crypto.randomUUID()
    const payload = {
      name: form.name.trim(),
      code: form.code.trim(),
      adminEmail: form.adminEmail.trim(),
    }
    const local = createOps.run(operationId, () => payload)
    try {
      const { data, error } = await client.rpc('create_company', {
        p_display_name: payload.name,
        p_company_code: payload.code,
        p_operation_id: operationId,
        p_admin_email: payload.adminEmail,
      })
      if (error) throw error
      const row = data as CompanyRow
      setCompanies((prev) => [row, ...prev.filter((item) => item.id !== row.id)])
      setForm({
        name: '',
        code: '',
        adminEmail: '',
        error: false,
        message: `회사를 등록했습니다. id=${row.id} operation_id=${operationId} (${local.status})`,
      })
    } catch (error) {
      setForm((prev) => ({
        ...prev,
        error: true,
        message: error instanceof Error ? error.message : String(error),
      }))
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return <p className="text-sm text-muted">세션을 확인하는 중입니다.</p>
  }

  if (!configured) {
    return (
      <p className="text-sm text-muted">
        중앙 프로젝트가 연결되지 않았습니다. Vercel 환경 변수를 확인하세요.
      </p>
    )
  }

  if (!user) {
    return (
      <p className="text-sm">
        회사 등록은 로그인한 운영 관리자만 할 수 있습니다.{' '}
        <Link className="text-accent underline" to="/login">
          로그인
        </Link>
      </p>
    )
  }

  if (!operator) {
    return (
      <div className="max-w-xl space-y-3 text-sm">
        <p>이 계정에는 운영 관리자 권한이 없습니다.</p>
        <p className="text-muted">
          일반 사용자는 스스로 승격할 수 없습니다. 최초 운영자는 Supabase에서
          app_metadata.platform_operator 를 지정합니다.
        </p>
      </div>
    )
  }

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">회사 관리</h1>
        <p className="mt-2 text-sm text-muted">
          운영 관리자만 회사를 등록합니다. 같은 operation_id 는 한 번만 적용됩니다.
        </p>
      </div>
      <form className="space-y-4 rounded-lg border border-line bg-card p-6" onSubmit={onSubmit}>
        <label className="block text-sm">
          회사명
          <input
            required
            className="mt-1 w-full rounded border border-line px-3 py-2"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </label>
        <label className="block text-sm">
          회사코드
          <input
            required
            className="mt-1 w-full rounded border border-line px-3 py-2"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
          />
        </label>
        <label className="block text-sm">
          최초 회사 관리자 이메일
          <input
            required
            type="email"
            className="mt-1 w-full rounded border border-line px-3 py-2"
            value={form.adminEmail}
            onChange={(e) => setForm({ ...form, adminEmail: e.target.value })}
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="rounded bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          회사 생성
        </button>
      </form>
      {form.message ? (
        <p className={form.error ? 'text-sm text-danger' : 'text-sm text-ok'}>{form.message}</p>
      ) : null}
      {companies.length > 0 ? (
        <ul className="space-y-2 text-sm">
          {companies.map((company) => (
            <li key={company.id} className="rounded border border-line bg-card px-4 py-3">
              <strong>{company.display_name}</strong>{' '}
              <span className="text-muted">
                {company.company_code} · {company.registration_status}
              </span>
              <p className="mt-1 font-mono text-xs text-muted">{company.id}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
