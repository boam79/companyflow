import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { loadContractsMenu, saveContractsMenu } from '../lib/company/modules'
import { notifyCompanyModules, useCompanySession } from '../lib/companySession'
import {
  displayCurrencyName,
  DISPLAY_TIMEZONES,
  formatCompanyClock,
  formatCompanyNumber,
  GROUPING_SAMPLE,
  loadCompanyDisplay,
  saveDisplayCurrency,
  saveDisplayGrouping,
  saveDisplayTimezone,
} from '../lib/company/displayCurrency'
import { COMPANY_DISPLAY, memberRoleLabel, openedCompanyOnly } from '../lib/company/settings'
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
  const { companyId, setCompanyId } = useCompanySession(Boolean(user))
  const [rows, setRows] = useState<CompanySettings[]>([])
  const [currency, setCurrency] = useState('KRW')
  const [draft, setDraft] = useState('KRW')
  const [grouping, setGrouping] = useState(true)
  const [groupingDraft, setGroupingDraft] = useState(true)
  const [timeZone, setTimeZone] = useState('Asia/Seoul')
  const [timeZoneDraft, setTimeZoneDraft] = useState('Asia/Seoul')
  const [contractsOn, setContractsOn] = useState(true)
  const [contractsDraft, setContractsDraft] = useState(true)
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
    setReady(false)
    let cancelled = false
    void (async () => {
      const { data: memberships, error: membershipError } = await client
        .from('company_memberships')
        .select('company_id, user_id, role')
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
      const listed = (companies ?? []).map((company) => {
        const membership =
          mine.find((row) => row.company_id === company.id && row.user_id === user.id) ??
          mine.find((row) => row.company_id === company.id)
        return {
          ...(company as CompanyRow),
          role: membership?.role ?? 'member',
          members: [] as MemberRow[],
        }
      })
      const open = openedCompanyOnly(listed, companyId)[0]
      if (!open) {
        if (cancelled) return
        setRows(listed)
        setReady(true)
        return
      }
      const { data, error } = await client.rpc('list_company_members', { p_company_id: open.id })
      if (error) throw error
      if (cancelled) return
      open.members = (data ?? []) as MemberRow[]
      setRows(listed)
      await sqlite.open(open.id)
      if (cancelled || sqlite.companyId !== open.id) return
      const current = await loadCompanyDisplay(sqlite)
      setCurrency(current.currency)
      setDraft(current.currency)
      setGrouping(current.grouping)
      setGroupingDraft(current.grouping)
      setTimeZone(current.timeZone)
      setTimeZoneDraft(current.timeZone)
      const menuOn = await loadContractsMenu(sqlite)
      if (cancelled || sqlite.companyId !== open.id) return
      setContractsOn(menuOn)
      setContractsDraft(menuOn)
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

  async function openSelectedFile() {
    if (!companyId) return false
    if (sqlite.companyId !== companyId) await sqlite.open(companyId)
    if (sqlite.companyId !== companyId) {
      setMessage('선택한 회사 원본이 열려 있지 않습니다.')
      return false
    }
    return true
  }

  async function saveCurrency() {
    if (!companyId) return
    setBusy(true)
    setNotice('')
    setMessage('')
    try {
      if (!(await openSelectedFile())) return
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
      if (!(await openSelectedFile())) return
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

  async function saveTimeZone() {
    if (!companyId) return
    setBusy(true)
    setNotice('')
    setMessage('')
    try {
      if (!(await openSelectedFile())) return
      const saved = await saveDisplayTimezone(sqlite, timeZoneDraft)
      setTimeZone(saved)
      setTimeZoneDraft(saved)
      setNotice('이 회사 원본에 시간대를 저장했습니다.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  async function saveContracts() {
    if (!companyId) return
    setBusy(true)
    setNotice('')
    setMessage('')
    try {
      if (!(await openSelectedFile())) return
      const saved = await saveContractsMenu(sqlite, contractsDraft)
      setContractsOn(saved)
      setContractsDraft(saved)
      notifyCompanyModules()
      setNotice(saved ? '이 회사 원본에서 계약 메뉴를 켰습니다.' : '이 회사 원본에서 계약 메뉴를 껐습니다.')
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
        <p className="mt-2 text-sm text-muted">이 PC에서 연 회사의 사람과 표시입니다. 백업은 아직 열지 않습니다.</p>
      </div>
      {message ? <p className="text-sm text-danger">{message}</p> : null}
      {notice ? <p className="text-sm text-ok">{notice}</p> : null}
      {rows.length === 0 ? <p className="text-sm text-muted">연결된 회사가 없습니다.</p> : null}
      {rows.length > 0 ? (
        <label className="block text-sm">
          이 PC에서 연 회사
          <select
            className="mt-1 block rounded border border-line px-3 py-2"
            value={companyId}
            onChange={(event) => setCompanyId(event.target.value)}
          >
            {rows.map((company) => (
              <option key={company.id} value={company.id}>
                {company.display_name}
              </option>
            ))}
          </select>
          <p className="mt-2 text-muted">다른 회사의 사람과 표시는 그 회사를 연 뒤에 봅니다.</p>
        </label>
      ) : null}
      {openedCompanyOnly(rows, companyId).map((company) => {
        const shown = { currency, grouping, timeZone }
        return (
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
              {COMPANY_DISPLAY.language} ·{' '}
              {formatCompanyClock(new Date(), shown.timeZone)} · {displayCurrencyName(shown.currency)} ·{' '}
              {formatCompanyNumber(GROUPING_SAMPLE, shown.grouping)}
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
            {company.id === companyId && (operator || company.role === 'company_admin') ? (
              <form
                className="mt-3 flex flex-wrap items-end gap-2"
                onSubmit={(event) => {
                  event.preventDefault()
                  void saveTimeZone()
                }}
              >
                <label className="text-sm">
                  시간대
                  <select
                    className="mt-1 block rounded border border-line px-3 py-2"
                    value={timeZoneDraft}
                    onChange={(event) => setTimeZoneDraft(event.target.value)}
                  >
                    {DISPLAY_TIMEZONES.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="submit"
                  disabled={busy || timeZoneDraft === timeZone}
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
                  void saveContracts()
                }}
              >
                <label className="text-sm">
                  계약 메뉴
                  <select
                    className="mt-1 block rounded border border-line px-3 py-2"
                    value={contractsDraft ? 'on' : 'off'}
                    onChange={(event) => setContractsDraft(event.target.value === 'on')}
                  >
                    <option value="on">사용</option>
                    <option value="off">사용 안 함</option>
                  </select>
                </label>
                <button
                  type="submit"
                  disabled={busy || contractsDraft === contractsOn}
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
        )
      })}
    </div>
  )
}
