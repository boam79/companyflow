import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { useCompanySession } from '../lib/companySession'
import {
  displayCurrencyName,
  formatCompanyNumber,
  GROUPING_SAMPLE,
  loadDisplayCurrency,
  loadDisplayGrouping,
  saveDisplayCurrency,
  saveDisplayGrouping,
} from '../lib/company/displayCurrency'
import { COMPANY_DISPLAY, memberRoleLabel } from '../lib/company/settings'
import { getCompanySqlite } from '../lib/sqlite/instance'
import { ORDER_CURRENCIES } from '../lib/stock/inventoryView'
import { getSupabase, type CompanyRow } from '../lib/supabase'

type MemberRow = {
  email: string
  role: string
  status: string
}

type CompanySettings = CompanyRow & {
  role: string
  members: MemberRow[]
}

const sqlite = getCompanySqlite()

export function CompanySettingsPage() {
  const { configured, loading, user, operator } = useAuth()
  const { companyId } = useCompanySession(Boolean(user))
  const [rows, setRows] = useState<CompanySettings[]>([])
  const [currency, setCurrency] = useState('KRW')
  const [draft, setDraft] = useState('KRW')
  const [grouping, setGrouping] = useState(true)
  const [groupingDraft, setGroupingDraft] = useState(true)
  const [message, setMessage] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const client = getSupabase()
    if (!client || !user) {
      setReady(true)
      return
    }
    let cancelled = false
    void (async () => {
      const { data: memberships, error: membershipError } = await client
        .from('company_memberships')
        .select('company_id, role')
        .eq('status', 'active')
      if (cancelled) return
      if (membershipError) {
        setMessage(membershipError.message)
        setReady(true)
        return
      }
      const mine = memberships ?? []
      if (mine.length === 0) {
        setRows([])
        setReady(true)
        return
      }
      const { data: companies, error: companyError } = await client
        .from('companies')
        .select('id, display_name, company_code, registration_status')
        .in(
          'id',
          mine.map((row) => row.company_id as string),
        )
      if (cancelled) return
      if (companyError) {
        setMessage(companyError.message)
        setReady(true)
        return
      }
      const listed = await Promise.all(
        (companies ?? []).map(async (company) => {
          const membership = mine.find((row) => row.company_id === company.id)
          const { data, error } = await client.rpc('list_company_members', { p_company_id: company.id })
          if (error) throw error
          return {
            ...(company as CompanyRow),
            role: membership?.role ?? 'member',
            members: (data ?? []) as MemberRow[],
          }
        }),
      )
      if (cancelled) return
      setRows(listed)
      if (companyId) {
        await sqlite.open(companyId)
        const saved = await loadDisplayCurrency(sqlite)
        const grouped = await loadDisplayGrouping(sqlite)
        if (cancelled) return
        setCurrency(saved)
        setDraft(saved)
        setGrouping(grouped)
        setGroupingDraft(grouped)
      }
      setReady(true)
    })().catch((error: unknown) => {
      if (cancelled) return
      setMessage(error instanceof Error ? error.message : String(error))
      setReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [companyId, user])

  async function saveCurrency() {
    if (!companyId) return
    setBusy(true)
    setNotice('')
    setMessage('')
    try {
      const saved = await saveDisplayCurrency(sqlite, draft)
      setCurrency(saved)
      setDraft(saved)
      setNotice('이 회사 원본에 통화를 저장했습니다.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  async function saveGrouping() {
    if (!companyId) return
    setBusy(true)
    setNotice('')
    setMessage('')
    try {
      const saved = await saveDisplayGrouping(sqlite, groupingDraft)
      setGrouping(saved)
      setGroupingDraft(saved)
      setNotice('이 회사 원본에 자리 구분을 저장했습니다.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  if (!configured) {
    return <p className="text-sm text-muted">중앙 운영이 연결되지 않았습니다.</p>
  }
  if (loading || (user && !ready)) {
    return <p className="text-sm text-muted">회사 설정을 확인하는 중입니다.</p>
  }
  if (!user) {
    return (
      <p className="text-sm">
        회사 설정은 로그인한 뒤 봅니다. <Link to="/login">로그인</Link>
      </p>
    )
  }

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">회사 설정</h1>
        <p className="mt-2 text-sm text-muted">이 계정에 연결된 회사와 사람입니다. 백업은 아직 열지 않습니다.</p>
      </div>
      {message ? <p className="text-sm text-danger">{message}</p> : null}
      {notice ? <p className="text-sm text-ok">{notice}</p> : null}
      {rows.length === 0 ? <p className="text-sm text-muted">연결된 회사가 없습니다.</p> : null}
      {rows.map((company) => (
        <section key={company.id} className="space-y-4 rounded-lg border border-line bg-card p-6">
          <div>
            <h2 className="text-lg font-semibold">{company.display_name}</h2>
            <p className="mt-1 text-sm text-muted">
              {company.company_code} · 이 계정은 {memberRoleLabel(company.role)}
            </p>
          </div>
          <div>
            <h3 className="text-sm font-semibold">연결된 사람</h3>
            <ul className="mt-2 space-y-1 text-sm">
              {company.members.map((member) => (
                <li key={member.email}>
                  {member.email} · {memberRoleLabel(member.role)}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold">표시</h3>
            <p className="mt-2 text-sm text-muted">
              {COMPANY_DISPLAY.language} · {COMPANY_DISPLAY.timezone} 시간 ·{' '}
              {company.id === companyId ? displayCurrencyName(currency) : COMPANY_DISPLAY.currency}
              {company.id === companyId ? ` · ${formatCompanyNumber(GROUPING_SAMPLE, grouping)}` : ''}
            </p>
            {company.id === companyId && (operator || company.role === 'company_admin') ? (
              <form
                className="mt-3 flex flex-wrap items-end gap-2"
                onSubmit={(event) => {
                  event.preventDefault()
                  void saveCurrency()
                }}
              >
                <label className="text-sm">
                  통화
                  <select
                    className="mt-1 block rounded border border-line px-3 py-2"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                  >
                    {ORDER_CURRENCIES.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="submit"
                  disabled={busy || draft === currency}
                  className="rounded bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  이 회사에 저장
                </button>
              </form>
            ) : null}
            {company.id === companyId && (operator || company.role === 'company_admin') ? (
              <form
                className="mt-3 flex flex-wrap items-end gap-2"
                onSubmit={(event) => {
                  event.preventDefault()
                  void saveGrouping()
                }}
              >
                <label className="text-sm">
                  자리 구분
                  <select
                    className="mt-1 block rounded border border-line px-3 py-2"
                    value={groupingDraft ? 'on' : 'off'}
                    onChange={(event) => setGroupingDraft(event.target.value === 'on')}
                  >
                    <option value="on">사용</option>
                    <option value="off">사용 안 함</option>
                  </select>
                </label>
                <button
                  type="submit"
                  disabled={busy || groupingDraft === grouping}
                  className="rounded bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  이 회사에 저장
                </button>
              </form>
            ) : null}
            {company.id === companyId && company.role === 'member' && !operator ? (
              <p className="mt-2 text-sm text-muted">통화 변경은 회사 관리자만 할 수 있습니다.</p>
            ) : null}
          </div>
        </section>
      ))}
    </div>
  )
}
