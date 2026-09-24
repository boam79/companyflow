import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import {
  COMPANY_MODULES,
  allModulesOn,
  loadCompanyModules,
  mergeModuleFlags,
  saveCompanyModule,
  type CompanyModuleId,
} from '../lib/company/modules'
import { fetchAllowedModulesByCompany, saveAllowedModules } from '../lib/company/moduleAccess'
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
import {
  COMPANY_DISPLAY,
  canEditCompanyModules,
  canEditCompanySettings,
  controlsOtherCompanies,
  memberRoleLabel,
  openedCompanyOnly,
} from '../lib/company/settings'
import { assertInviteRole, normalizeInviteEmail, type InviteRole } from '../lib/invite'
import { getCompanySqlite } from '../lib/sqlite/instance'
import { ORDER_CURRENCIES } from '../lib/stock/inventoryView'
import { getSupabase, type CompanyRow } from '../lib/supabase'

type MemberRow = {
  email: string
  role: string
  status: string
}

type OpenInvite = {
  id: string
  email: string
  role: string
  expires_at: string
  accepted_at: string | null
}

type CompanySettings = CompanyRow & {
  role: string
  linked: boolean
  members: MemberRow[]
}

const sqlite = getCompanySqlite()

export function CompanySettingsPage() {
  const { configured, loading, user, operator } = useAuth()
  const { companyId, setCompanyId } = useCompanySession(Boolean(user))
  const [rows, setRows] = useState<CompanySettings[]>([])
  const [tenants, setTenants] = useState<CompanyRow[]>([])
  const [currency, setCurrency] = useState('KRW')
  const [draft, setDraft] = useState('KRW')
  const [grouping, setGrouping] = useState(true)
  const [groupingDraft, setGroupingDraft] = useState(true)
  const [timeZone, setTimeZone] = useState('Asia/Seoul')
  const [timeZoneDraft, setTimeZoneDraft] = useState('Asia/Seoul')
  const [modules, setModules] = useState<Record<string, Record<CompanyModuleId, boolean>>>({})
  const [invites, setInvites] = useState<OpenInvite[]>([])
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<InviteRole>('member')
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
        .eq('user_id', user.id)
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
        setTenants([])
        setInvites([])
        setReady(true)
        return
      }
      const { data, error: companyError } = await client
        .from('companies')
        .select('id, display_name, company_code, registration_status')
        .in(
          'id',
          mine.map((row) => row.company_id as string),
        )
      if (companyError) {
        setMessage(companyError.message)
        setReady(true)
        return
      }
      const source = (data ?? []) as CompanyRow[]
      if (cancelled) return
      if (source.length === 0) {
        setRows([])
        setTenants([])
        setInvites([])
        setReady(true)
        return
      }
      const listed = source.map((company) => {
        const membership = mine.find((row) => row.company_id === company.id)
        return {
          ...company,
          role: membership?.role ?? 'member',
          linked: Boolean(membership),
          members: [] as MemberRow[],
        }
      })
      const open = openedCompanyOnly(listed, companyId)[0]
      if (!open) {
        if (cancelled) return
        setRows(listed)
        setTenants([])
        setInvites([])
        setReady(true)
        return
      }
      const { data, error } = await client.rpc('list_company_members', { p_company_id: open.id })
      if (error) throw error
      if (cancelled) return
      open.members = (data ?? []) as MemberRow[]
      setRows(listed)
      if (canEditCompanySettings(open.role, operator)) {
        const listedInvites = await client.rpc('list_company_invitations', { p_company_id: open.id })
        if (listedInvites.error) throw listedInvites.error
        if (cancelled) return
        setInvites((listedInvites.data ?? []) as OpenInvite[])
      } else {
        setInvites([])
      }
      await sqlite.open(open.id)
      if (cancelled || sqlite.companyId !== open.id) return
      const current = await loadCompanyDisplay(sqlite)
      setCurrency(current.currency)
      setDraft(current.currency)
      setGrouping(current.grouping)
      setGroupingDraft(current.grouping)
      setTimeZone(current.timeZone)
      setTimeZoneDraft(current.timeZone)
      const others: CompanyRow[] = []
      if (operator && controlsOtherCompanies(open)) {
        const { data: allCompanies, error: allError } = await client
          .from('companies')
          .select('id, display_name, company_code, registration_status')
          .order('created_at', { ascending: false })
        if (allError) throw allError
        others.push(...((allCompanies ?? []) as CompanyRow[]).filter((company) => company.id !== open.id))
      }
      const allowed = await fetchAllowedModulesByCompany([open.id, ...others.map((company) => company.id)])
      const nextModules: Record<string, Record<CompanyModuleId, boolean>> = {
        [open.id]: mergeModuleFlags(await loadCompanyModules(sqlite), allowed.get(open.id) ?? null),
      }
      if (operator && controlsOtherCompanies(open)) {
        for (const company of others) {
          nextModules[company.id] = mergeModuleFlags(allModulesOn(), allowed.get(company.id) ?? null)
        }
      }
      if (cancelled || sqlite.companyId !== open.id) return
      setTenants(others)
      setModules(nextModules)
      setReady(true)
    })().catch((error: unknown) => {
      if (cancelled) return
      setMessage(error instanceof Error ? error.message : String(error))
      setReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [companyId, operator, user])

  async function openSelectedFile() {
    if (!companyId) return false
    if (sqlite.companyId !== companyId) await sqlite.open(companyId)
    if (sqlite.companyId !== companyId) {
      setMessage('선택한 회사 원본이 열려 있지 않습니다.')
      return false
    }
    return true
  }

  function canSaveOpenCompany() {
    const open = rows.find((row) => row.id === companyId)
    if (!canEditCompanySettings(open?.role, operator)) {
      setMessage('표시는 이 회사 관리자나 운영 계정만 바꿉니다.')
      return false
    }
    return true
  }

  async function saveCurrency() {
    if (!companyId || !canSaveOpenCompany()) return
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
    if (!companyId || !canSaveOpenCompany()) return
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
    if (!companyId || !canSaveOpenCompany()) return
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

  async function saveModule(targetId: string, moduleId: CompanyModuleId, on: boolean) {
    if (!targetId || !canEditCompanyModules(operator)) {
      setMessage('모듈은 운영 계정만 바꿉니다.')
      return
    }
    setBusy(true)
    setNotice('')
    setMessage('')
    try {
      const current = modules[targetId] ?? allModulesOn()
      const next = { ...current, [moduleId]: on }
      if (targetId === companyId) {
        if (!(await openSelectedFile())) return
        await saveCompanyModule(sqlite, moduleId, on)
        notifyCompanyModules()
      }
      await saveAllowedModules(targetId, next)
      setModules((prev) => ({ ...prev, [targetId]: next }))
      const label = COMPANY_MODULES.find((item) => item.id === moduleId)?.label ?? '모듈'
      const name =
        rows.find((row) => row.id === targetId)?.display_name ??
        tenants.find((row) => row.id === targetId)?.display_name ??
        '회사'
      setNotice(on ? `${name}의 ${label}을 켰습니다.` : `${name}의 ${label}을 껐습니다.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      if (companyId && sqlite.companyId !== companyId) {
        try {
          await sqlite.open(companyId)
        } catch (error) {
          setMessage(error instanceof Error ? error.message : String(error))
        }
      }
      setBusy(false)
    }
  }

  async function onInvite(event: FormEvent) {
    event.preventDefault()
    const client = getSupabase()
    const open = rows.find((row) => row.id === companyId)
    if (!client || !open || !canEditCompanySettings(open.role, operator)) return
    setBusy(true)
    setNotice('')
    setMessage('')
    try {
      const email = normalizeInviteEmail(inviteEmail)
      const role = assertInviteRole(inviteRole)
      const { error } = await client.rpc('invite_company_user', {
        p_company_id: open.id,
        p_email: email,
        p_role: role,
      })
      if (error) throw error
      setInviteEmail('')
      setNotice('초대를 남겼습니다. 메일은 보내지 않습니다. 그 계정으로 로그인한 뒤 수락해야 권한이 생깁니다.')
      const listed = await client.rpc('list_company_invitations', { p_company_id: open.id })
      if (listed.error) throw listed.error
      setInvites((listed.data ?? []) as OpenInvite[])
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  function moduleFields(targetId: string) {
    const flags = modules[targetId]
    return (
      <div className="mt-3 space-y-2">
        {COMPANY_MODULES.map((item) => (
          <label key={item.id} className="flex items-center justify-between gap-3 text-sm">
            {item.label}
            <select
              className="rounded border border-line px-3 py-2"
              value={flags?.[item.id] === false ? 'off' : 'on'}
              disabled={busy || !flags}
              onChange={(event) => void saveModule(targetId, item.id, event.target.value === 'on')}
            >
              <option value="on">사용</option>
              <option value="off">사용 안 함</option>
            </select>
          </label>
        ))}
      </div>
    )
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
        <p className="mt-2 text-sm text-muted">
          운영 계정은 다른 회사 모듈만 켭니다. 사람·재고·자산·계약은 그 회사 지정 PC에서만 보입니다.
        </p>
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
          <p className="mt-2 text-muted">
            {canEditCompanyModules(operator)
              ? '다른 회사 사람·재고는 이 PC 메뉴에 넣지 않습니다. 아래 칸에서 모듈만 켭니다.'
              : '모듈은 운영 계정만 바꿉니다.'}
          </p>
        </label>
      ) : null}
      {openedCompanyOnly(rows, companyId).map((company) => {
        const shown = { currency, grouping, timeZone }
        const canEdit = canEditCompanySettings(company.role, operator)
        const canModules = canEditCompanyModules(operator)
        return (
          <section key={company.id} className="space-y-4 rounded-lg border border-line bg-card p-6">
            <div>
              <h2 className="text-lg font-semibold">{company.display_name}</h2>
              <p className="mt-1 text-sm text-muted">
                {company.company_code} · 이 계정은{' '}
                {operator && !company.linked ? '운영(최고 관리자)' : memberRoleLabel(company.role)}
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
              {canEdit ? (
                <form className="mt-3 space-y-2" onSubmit={(event) => void onInvite(event)}>
                  <p className="text-sm text-muted">이 회사 사용자만 초대합니다. 메일은 보내지 않습니다.</p>
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="text-sm">
                      이메일
                      <input
                        required
                        type="email"
                        className="mt-1 block rounded border border-line px-3 py-2"
                        value={inviteEmail}
                        onChange={(event) => setInviteEmail(event.target.value)}
                      />
                    </label>
                    <label className="text-sm">
                      역할
                      <select
                        className="mt-1 block rounded border border-line px-3 py-2"
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
                  </div>
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
              ) : null}
            </div>
            <div>
              <h3 className="text-sm font-semibold">표시</h3>
              <p className="mt-2 text-sm text-muted">
                {COMPANY_DISPLAY.language} ·{' '}
                {formatCompanyClock(new Date(), shown.timeZone)} · {displayCurrencyName(shown.currency)} ·{' '}
                {formatCompanyNumber(GROUPING_SAMPLE, shown.grouping)}
              </p>
              {canEdit ? (
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
              {canEdit ? (
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
              {canEdit ? (
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
              {canModules ? (
                <div className="mt-4">
                  <h3 className="text-sm font-semibold">모듈</h3>
                  {moduleFields(company.id)}
                </div>
              ) : canEdit ? (
                <p className="mt-2 text-sm text-muted">모듈은 운영 계정만 바꿉니다.</p>
              ) : (
                <p className="mt-2 text-sm text-muted">표시 변경은 이 회사 관리자만 할 수 있습니다.</p>
              )}
            </div>
          </section>
        )
      })}
      {operator && controlsOtherCompanies(rows.find((row) => row.id === companyId))
        ? tenants.map((company) => (
            <section key={company.id} className="space-y-3 rounded-lg border border-line bg-card p-6">
              <div>
                <h2 className="text-lg font-semibold">{company.display_name}</h2>
                <p className="mt-1 text-sm text-muted">
                  {company.company_code} · 이 칸에서는 모듈만 켭니다. 사람·재고·자산·계약은 이 PC 메뉴에 넣지 않습니다.
                </p>
              </div>
              {moduleFields(company.id)}
            </section>
          ))
        : null}
    </div>
  )
}
