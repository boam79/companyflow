import { allowedOpenedCompanyId } from '../companySession'
import { GUEST_COMPANY_ID } from '../guest/ids'
import type { CompanyRow } from '../supabase'

export function mayOpenCompanyWork(guest: boolean, companyId: string, companies: CompanyRow[]) {
  if (guest) return companyId === GUEST_COMPANY_ID
  return Boolean(allowedOpenedCompanyId(companyId, companies))
}

export function canWriteOpenedCompany(guest: boolean, companyId: string, sqliteCompanyId: string) {
  if (guest) return sqliteCompanyId === GUEST_COMPANY_ID
  return Boolean(companyId) && companyId === sqliteCompanyId
}

export type WorkSessionKind = 'ok' | 'login' | 'loading' | 'no-company'

export function workSessionKind(input: {
  guest: boolean
  signedIn: boolean
  ready: boolean
  companyId: string
}): WorkSessionKind {
  if (input.guest) return 'ok'
  if (!input.signedIn) return 'login'
  if (!input.ready) return 'loading'
  if (!input.companyId) return 'no-company'
  return 'ok'
}
