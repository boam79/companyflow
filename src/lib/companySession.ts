import { useEffect, useState } from 'react'
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

export function lastOpenedCompanyId(): string {
  return readStore(COMPANY_KEY)
}

export function rememberOpenedCompany(id: string) {
  if (id) writeStore(COMPANY_KEY, id)
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

export function initialCompanySession(openId = '') {
  const companies = rememberedCompanies()
  const companyId = openId || lastOpenedCompanyId() || companies[0]?.id || ''
  return { companies, companyId }
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
    void client
      .from('companies')
      .select('id, display_name, company_code, registration_status')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (cancelled || !data?.length) return
        const rows = data as CompanyRow[]
        rememberCompanies(rows)
        setCompanies(rows)
        setCompanyIdState((prev) => {
          const next = prev || rows[0].id
          if (next) rememberOpenedCompany(next)
          return next
        })
      })
    return () => {
      cancelled = true
    }
  }, [enabled])

  function setCompanyId(next: string) {
    if (next) rememberOpenedCompany(next)
    setCompanyIdState(next)
  }

  return { companies, companyId, setCompanyId, setCompanies }
}
