import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ProcessedOperations } from '../lib/idempotency'
import { useAuth } from '../lib/AuthContext'
import { operatorDeleteAuthUser, operatorDeleteAccountConfirmMessage } from '../lib/account'
import { assertCustomerAdminEmail, opsCreateLead, opsPageLead } from '../lib/invite'
import { publicErrorMessage } from '../lib/publicError'
import { getSupabase, type CompanyRow } from '../lib/supabase'

type CreateState = {
  name: string
  code: string
  adminEmail: string
  message: string
  error: boolean
}

const createOps = new ProcessedOperations()

/** 등록 목록만 불러온다. 업무 세션에 rememberCompanies 하지 않는다. */
async function loadAdminCompanies(operator: boolean) {
  const client = getSupabase()
  if (!client || !operator) return [] as CompanyRow[]
  const { data, error } = await client
    .from('companies')
    .select('id, display_name, company_code, registration_status')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as CompanyRow[]
}

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
  const [companiesReady, setCompaniesReady] = useState(false)
  const [listError, setListError] = useState('')
  const [busy, setBusy] = useState(false)
  const [deleteEmail, setDeleteEmail] = useState('')
  const [deleteMessage, setDeleteMessage] = useState('')
  const [deleteError, setDeleteError] = useState(false)

  useEffect(() => {
    if (!user) return
    let cancelled = false
    void loadAdminCompanies(operator)
      .then((rows) => {
        if (cancelled) return
        setCompanies(rows)
        setListError('')
        setCompaniesReady(true)
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setCompaniesReady(true)
        setListError(publicErrorMessage(error))
      })
    return () => {
      cancelled = true
    }
  }, [operator, user])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const client = getSupabase()
    if (!client || !operator) return
    setBusy(true)
    const operationId = crypto.randomUUID()
    const payload = {
      name: form.name.trim(),
      code: form.code.trim(),
      adminEmail: assertCustomerAdminEmail(form.adminEmail, user?.email),
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
        message: `회사를 등록했습니다. id=${row.id} operation_id=${operationId} (${local.status}). 사람·재고는 그 회사 지정 PC에서만 보입니다.`,
      })
    } catch (error) {
      setForm((prev) => ({
        ...prev,
        error: true,
        message: publicErrorMessage(error),
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

  async function onDeleteAuthUser(event: FormEvent) {
    event.preventDefault()
    const client = getSupabase()
    if (!client) return
    if (!window.confirm(operatorDeleteAccountConfirmMessage())) return
    setBusy(true)
    setDeleteError(false)
    setDeleteMessage('')
    try {
      await operatorDeleteAuthUser(client, deleteEmail)
      const rows = await loadAdminCompanies(operator)
      setCompanies(rows)
      setDeleteEmail('')
      setDeleteMessage('계정과 그 사람이 관리하던 회사(지점)를 지웠습니다. 같은 이메일로 다시 가입할 수 있습니다.')
    } catch (error) {
      setDeleteError(true)
      setDeleteMessage(publicErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  if (!operator && !companiesReady) {
    return <p className="text-sm text-muted">회사 권한을 확인하는 중입니다.</p>
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
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">회사 관리</h1>
        <p className="mt-2 text-sm text-muted">{opsPageLead()}</p>
      </div>
      {listError ? <p className="text-sm text-danger">{listError}</p> : null}
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <form className="space-y-4 rounded-lg border border-line bg-card p-6" onSubmit={onSubmit}>
          <h2 className="text-lg font-semibold">회사 생성</h2>
          <p className="text-sm text-muted">{opsCreateLead()}</p>
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
          {form.message ? (
            <p className={form.error ? 'text-sm text-danger' : 'text-sm text-ok'}>{form.message}</p>
          ) : null}
        </form>
        <form className="space-y-4 rounded-lg border border-line bg-card p-6" onSubmit={(event) => void onDeleteAuthUser(event)}>
          <h2 className="text-lg font-semibold">계정 삭제</h2>
          <p className="text-sm text-muted">
            테스트 이메일을 다시 쓰려면 그 계정과, 그 사람이 관리하던 회사·사람이 없는 회사(지점)를 지웁니다. 운영
            계정과 본사는 남습니다. 이 PC의 회사 원본 파일은 남습니다.
          </p>
          <label className="block text-sm">
            이메일
            <input
              required
              type="email"
              className="mt-1 w-full rounded border border-line px-3 py-2"
              value={deleteEmail}
              onChange={(event) => setDeleteEmail(event.target.value)}
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="rounded bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            이 이메일 계정 지우기
          </button>
          {deleteMessage ? (
            <p className={deleteError ? 'text-sm text-danger' : 'text-sm text-ok'}>{deleteMessage}</p>
          ) : null}
        </form>
      </div>
      {companies.length > 0 ? (
        <ul className="grid gap-2 text-sm sm:grid-cols-2">
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
