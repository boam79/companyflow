import { getSupabase } from '../supabase'
import {
  loadCompanyModule,
  loadCompanyModules,
  mergeModuleFlags,
  parseAllowedModules,
  type CompanyModuleId,
} from './modules'

type ModuleDb = {
  query: <T>(sql: string, params?: unknown[]) => Promise<T[]>
}

export async function fetchAllowedModules(companyId: string) {
  const client = getSupabase()
  if (!client || !companyId) return null
  const { data, error } = await client
    .from('company_entitlements')
    .select('allowed_modules')
    .eq('company_id', companyId)
    .maybeSingle()
  if (error) throw error
  return parseAllowedModules(data?.allowed_modules)
}

export async function fetchAllowedModulesByCompany(ids: string[]) {
  const client = getSupabase()
  const map = new Map<string, ReturnType<typeof parseAllowedModules>>()
  if (!client || ids.length === 0) return map
  const { data, error } = await client
    .from('company_entitlements')
    .select('company_id, allowed_modules')
    .in('company_id', ids)
  if (error) throw error
  for (const row of data ?? []) {
    map.set(row.company_id as string, parseAllowedModules(row.allowed_modules))
  }
  return map
}

export async function saveAllowedModules(companyId: string, flags: Record<CompanyModuleId, boolean>) {
  const client = getSupabase()
  if (!client) throw new Error('중앙 운영이 연결되지 않았습니다.')
  const { error } = await client
    .from('company_entitlements')
    .update({
      allowed_modules: {
        stock: flags.stock,
        assets: flags.assets,
        people: flags.people,
        contracts: flags.contracts,
      },
    })
    .eq('company_id', companyId)
  if (error) throw error
}

export async function readCompanyModules(db: Pick<ModuleDb, 'query'>, companyId: string, guest = false) {
  const local = await loadCompanyModules(db)
  if (guest) return local
  return mergeModuleFlags(local, await fetchAllowedModules(companyId))
}

export async function readCompanyModule(
  db: Pick<ModuleDb, 'query'>,
  companyId: string,
  id: CompanyModuleId,
  guest = false,
) {
  if (guest) return loadCompanyModule(db, id)
  const flags = await readCompanyModules(db, companyId, guest)
  return flags[id]
}
