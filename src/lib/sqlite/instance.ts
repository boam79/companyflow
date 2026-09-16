import { CompanySqlite } from './client'

let shared: CompanySqlite | null = null

export function getCompanySqlite(): CompanySqlite {
  if (!shared) {
    shared = new CompanySqlite()
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', () => shared?.close())
    }
  }
  return shared
}
