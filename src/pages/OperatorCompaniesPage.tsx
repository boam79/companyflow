import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ProcessedOperations } from '../lib/idempotency'
import { useAuth } from '../lib/AuthContext'
import { rememberCompanies, rememberedCompanies } from '../lib/companySession'
import { assertInviteRole, normalizeInviteEmail, type InviteRole } from '../lib/invite'
import { getSupabase, type CompanyRow } from '../lib/supabase'

type CreateState = {
  name: string
  code: string
  adminEmail: string
  message: string
  error: boolean
}

const createOps = new ProcessedOperations()

type OpenInvite = {
  id: string
  email: string
  role: string
  expires_at: string
  accepted_at: string | null
}

async function loadAdminCompanies(operator: boolean) {
  const client = getSupabase()
  if (!client) return [] as CompanyRow[]
  if (operator) {
    const { data, error } = await client
      .from('companies')
      .select('id, display_name, company_code, registration_status')
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []) as CompanyRow[]
  }
  const { data: memberships, error: membershipError } = await client
    .from('company_memberships')
    .select('company_id')
    .eq('role', 'company_admin')
    .eq('status', 'active')
  if (membershipError) throw membershipError
  const ids = (memberships ?? []).map((row) => row.company_id as string)
  if (ids.length === 0) return []
  const { data, error } = await client
    .from('companies')
    .select('id, display_name, company_code, registration_status')
    .in('id', ids)
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
  const [companies, setCompanies] = useState<CompanyRow[]>(() => (operator ? rememberedCompanies() : []))
  const [companiesReady, setCompaniesReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [inviteCompanyId, setInviteCompanyId] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<InviteRole>('member')
  const [invites, setInvites] = useState<OpenInvite[]>([])
  const [inviteMessage, setInviteMessage] = useState('')
  const [inviteError, setInviteError] = useState(false)

  useEffect(() => {
    if (!user) return
    let cancelled = false
    void loadAdminCompanies(operator)
      .then((rows) => {
        if (cancelled) return
        if (operator) rememberCompanies(rows)
        setCompanies(rows)
        setInviteCompanyId((current) => current || rows[0]?.id || '')
        setCompaniesReady(true)
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setCompaniesReady(true)
        setInviteError(true)
        setInviteMessage(error instanceof Error ? error.message : String(error))
      })
    return () => {
      cancelled = true
    }
  }, [operator, user])

  useEffect(() => {
    const client = getSupabase()
    if (!client || !inviteCompanyId) {
      setInvites([])
      return
    }
    let cancelled = false
    void client.rpc('list_company_invitations', { p_company_id: inviteCompanyId }).then(({ data, error }) => {
      if (cancelled) return
      if (error) {
        setInviteError(true)
        setInviteMessage(error.message)
        return
      }
      setInvites((data ?? []) as OpenInvite[])
    })
    return () => {
      cancelled = true
    }
  }, [inviteCompanyId])

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
      setCompanies((prev) => {
        const next = [row, ...prev.filter((item) => item.id !== row.id)]
        rememberCompanies(next)
        return next
      })
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

  async function onInvite(event: FormEvent) {
    event.preventDefault()
    const client = getSupabase()
    if (!client || !inviteCompanyId) return
    setBusy(true)
    setInviteError(false)
    setInviteMessage('')
    try {
      const email = normalizeInviteEmail(inviteEmail)
      const role = assertInviteRole(inviteRole)
      const { error } = await client.rpc('invite_company_user', {
        p_company_id: inviteCompanyId,
        p_email: email,
        p_role: role,
      })
      if (error) throw error
      setInviteEmail('')
      setInviteMessage('초대를 남겼습니다. 메일은 보내지 않습니다. 그 계정으로 로그인한 뒤 수락해야 권한이 생깁니다.')
      const listed = await client.rpc('list_company_invitations', { p_company_id: inviteCompanyId })
      if (listed.error) throw listed.error
      setInvites((listed.data ?? []) as OpenInvite[])
    } catch (error) {
      setInviteError(true)
      setInviteMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const inviteForm = companies.length > 0 ? (
    <form className="space-y-4 rounded-lg border border-line bg-card p-6" onSubmit={(event) => void onInvite(event)}>
      <h2 className="text-lg font-semibold">사용자 초대</h2>
      <p className="text-sm text-muted">수락 전에는 이 회사 업무를 열 수 없습니다. 메일은 보내지 않습니다.</p>
      <label className="block text-sm">
        회사
        <select
          className="mt-1 w-full rounded border border-line px-3 py-2"
          value={inviteCompanyId}
          onChange={(event) => setInviteCompanyId(event.target.value)}
        >
          {companies.map((company) => (
            <option key={company.id} value={company.id}>
              {company.display_name}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        이메일
        <input
          required
          type="email"
          className="mt-1 w-full rounded border border-line px-3 py-2"
          value={inviteEmail}
          onChange={(event) => setInviteEmail(event.target.value)}
        />
      </label>
      <label className="block text-sm">
        역할
        <select
          className="mt-1 w-full rounded border border-line px-3 py-2"
          value={inviteRole}
          onChange={(event) => setInviteRole(assertInviteRole(event.target.value))}
        >
          <option value="member">사용자</option>
          <option value="company_admin">회사 관리자</option>
        </select>
      </label>
      <button
        type="submit"
        disabled={busy}
        className="rounded bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        초대 남기기
      </button>
      {inviteMessage ? (
        <p className={inviteError ? 'text-sm text-danger' : 'text-sm text-ok'}>{inviteMessage}</p>
      ) : null}
      {invites.length > 0 ? (
        <ul className="space-y-1 text-sm text-muted">
          {invites.map((invite) => (
            <li key={invite.id}>
              {invite.email} · {invite.role === 'company_admin' ? '회사 관리자' : '사용자'} ·{' '}
              {invite.accepted_at ? '수락함' : '수락 전'}
            </li>
          ))}
        </ul>
      ) : null}
    </form>
  ) : null

  if (!operator && !companiesReady) {
    return <p className="text-sm text-muted">회사 권한을 확인하는 중입니다.</p>
  }

  if (!operator && companies.length === 0) {
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
          {operator
            ? '운영 관리자만 회사를 등록합니다. 같은 operation_id 는 한 번만 적용됩니다.'
            : '이 회사의 관리자만 사용자를 초대합니다. 수락 전에는 권한이 없습니다.'}
        </p>
      </div>
      {operator ? (
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
      ) : null}
      {form.message ? (
        <p className={form.error ? 'text-sm text-danger' : 'text-sm text-ok'}>{form.message}</p>
      ) : null}
      {inviteForm}
      {operator && companies.length > 0 ? (
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
