export const COMPANY_MODULES = [
  { id: 'stock', label: '구매·재고', path: '/stock' },
  { id: 'assets', label: '자산', path: '/assets' },
  { id: 'people', label: '입퇴사', path: '/people' },
  { id: 'contracts', label: '계약', path: '/contracts' },
] as const

export type CompanyModuleId = (typeof COMPANY_MODULES)[number]['id']

export const CONTRACTS_MODULE_KEY = 'module_contracts'

export function moduleMetaKey(id: CompanyModuleId) {
  return `module_${id}`
}

export function moduleEnabled(value: string | null | undefined) {
  return value?.trim() !== 'off'
}

export function contractsMenuOn(value: string | null | undefined) {
  return moduleEnabled(value)
}

type ModuleDb = {
  query: <T>(sql: string, params?: unknown[]) => Promise<T[]>
  exec: (sql: string, params?: unknown[]) => Promise<void>
}

async function readModule(db: Pick<ModuleDb, 'query'>, id: CompanyModuleId) {
  const rows = await db.query<{ value: string }>('select value from meta where key = ?', [moduleMetaKey(id)])
  return moduleEnabled(rows[0]?.value)
}

export async function loadCompanyModule(db: Pick<ModuleDb, 'query'>, id: CompanyModuleId) {
  return readModule(db, id)
}

export async function loadCompanyModules(db: Pick<ModuleDb, 'query'>) {
  const flags = {} as Record<CompanyModuleId, boolean>
  for (const item of COMPANY_MODULES) flags[item.id] = await readModule(db, item.id)
  return flags
}

export async function saveCompanyModule(db: ModuleDb, id: CompanyModuleId, on: boolean) {
  await db.exec('insert or replace into meta(key, value) values(?, ?)', [moduleMetaKey(id), on ? 'on' : 'off'])
  return on
}

export function firstEnabledModulePath(flags: Partial<Record<CompanyModuleId, boolean>> | undefined) {
  const item = COMPANY_MODULES.find((module) => flags?.[module.id] !== false)
  return item?.path ?? '/settings'
}

export async function loadContractsMenu(db: Pick<ModuleDb, 'query'>) {
  return loadCompanyModule(db, 'contracts')
}

export async function saveContractsMenu(db: ModuleDb, on: boolean) {
  return saveCompanyModule(db, 'contracts', on)
}
