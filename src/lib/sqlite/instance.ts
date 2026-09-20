import { CompanySqlite } from './client'

let shared: CompanySqlite | null = null
let guest: CompanySqlite | null = null

function bindPageHide(target: () => CompanySqlite | null) {
  if (typeof window === 'undefined') return
  window.addEventListener('pagehide', () => target()?.close())
}

export function getCompanySqlite(): CompanySqlite {
  if (!shared) {
    shared = new CompanySqlite()
    bindPageHide(() => shared)
  }
  return shared
}

export function getGuestSqlite(): CompanySqlite {
  if (!guest) {
    guest = new CompanySqlite()
    bindPageHide(() => guest)
  }
  return guest
}
