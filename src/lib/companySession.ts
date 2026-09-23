import { useEffect, useState } from 'react'
import { assertCompanyStorageId } from './companyPaths'
import { getCompanySqlite } from './sqlite/instance'
import { getSupabase, type CompanyRow } from './supabase'

const COMPANY_KEY = 'companyflow.lastCompanyId'
const LIST_KEY = 'companyflow.companies'

const memory = new Map<string, string>()

function readStore(key: string): string {
  try {
    if (typeof sessionStorage !== 'undefined') {
      return sessionStorage.getItem(key) ?? ''
    }
  } catch {
    /* private mode */
  }
  return memory.get(key) ?? ''
}

function writeStore(key: string, value: string) {
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(key, value)
      return
    }
  } catch {
    /* private mode */
  }
  memory.set(key, value)
}

function safeCompanyId(id: string): string {
  try {
    return assertCompanyStorageId(id)
  } catch {
    return ''
  }
}

export function lastOpenedCompanyId(): string {
  return safeCompanyId(readStore(COMPANY_KEY))
}

export function rememberOpenedCompany(id: string) {
  const next = safeCompanyId(id)
  if (next) writeStore(COMPANY_KEY, next)
}

export function rememberedCompanies(): CompanyRow[] {
  try {
    const raw = readStore(LIST_KEY)
    if (!raw) return []
    const rows = JSON.parse(raw) as CompanyRow[]
    if (!Array.isArray(rows)) return []
    return rows.filter(
      (row) =>
        Boolean(row) &&
        typeof row.id === 'string' &&
        Boolean(safeCompanyId(row.id)) &&
        typeof row.display_name === 'string' &&
        typeof row.company_code === 'string',
    )
  } catch {
    return []
  }
}

export function rememberCompanies(rows: CompanyRow[]) {
  writeStore(
    LIST_KEY,
    JSON.stringify(
      rows.map((row) => ({
        id: row.id,
        display_name: row.display_name,
        company_code: row.company_code,
        registration_status: row.registration_status ?? '',
      })),
    ),
  )
}

export function clearCompanySession() {
  memory.clear()
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(COMPANY_KEY)
      sessionStorage.removeItem(LIST_KEY)
    }
  } catch {
    /* node */
  }
}

export function seedInvalidCompanyList() {
  writeStore(LIST_KEY, '{')
}

export function notifyOpenCompany(id: string) {
  if (typeof window === 'undefined' || !id) return
  window.dispatchEvent(new CustomEvent('companyflow-open-company', { detail: id }))
}

export function notifyCompanyModules() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('companyflow-modules'))
}

export function companyIdInList(id: string, companies: CompanyRow[]) {
  const safe = safeCompanyId(id)
  if (safe && companies.some((row) => row.id === safe)) return safe
  return companies[0]?.id ?? ''
}

export function allowedOpenedCompanyId(id: string, companies: CompanyRow[]) {
  const safe = safeCompanyId(id)
  if (safe && companies.some((row) => row.id === safe)) return safe
  return ''
}

export function initialCompanySession(openId = '') {
  const companies = rememberedCompanies()
  const open = safeCompanyId(openId)
  if (open) return { companies, companyId: open }
  return { companies, companyId: companyIdInList(lastOpenedCompanyId(), companies) }
}

export function useCompanySession(enabled: boolean) {
  const [companies, setCompanies] = useState(
    () => initialCompanySession(getCompanySqlite().companyId).companies,
  )
  const [companyId, setCompanyIdState] = useState(
    () => initialCompanySession(getCompanySqlite().companyId).companyId,
  )

  useEffect(() => {
    if (!enabled) return
    const client = getSupabase()
    if (!client) return
    let cancelled = false
    void (async () => {
      const { data: sessionData } = await client.auth.getUser()
      const userId = sessionData.user?.id
      if (!userId) return
      const { data: memberships, error: membershipError } = await client
        .from('company_memberships')
        .select('company_id')
        .eq('user_id', userId)
        .eq('status', 'active')
      if (cancelled) return
      if (membershipError || !memberships?.length) {
        rememberCompanies([])
        setCompanies([])
        setCompanyIdState('')
        return
      }
      const ids = [...new Set(memberships.map((row) => row.company_id as string))]
      const { data } = await client
        .from('companies')
        .select('id, display_name, company_code, registration_status')
        .in('id', ids)
        .order('created_at', { ascending: false })
      if (cancelled || !data?.length) {
        rememberCompanies([])
        setCompanies([])
        setCompanyIdState('')
        return
      }
      const rows = data as CompanyRow[]
      rememberCompanies(rows)
      setCompanies(rows)
      setCompanyIdState((prev) => {
        const next = companyIdInList(prev, rows)
        if (next) rememberOpenedCompany(next)
        return next
      })
    })()
    return () => {
      cancelled = true
    }
  }, [enabled])

  function setCompanyId(next: string) {
    const allowed = allowedOpenedCompanyId(next, companies)
    if (!allowed) return
    rememberOpenedCompany(allowed)
    notifyOpenCompany(allowed)
    setCompanyIdState(allowed)
  }

  return { companies, companyId, setCompanyId, setCompanies }
}
