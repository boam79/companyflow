export const CONTRACTS_MODULE_KEY = 'module_contracts'

export function contractsMenuOn(value: string | null | undefined) {
  return value?.trim() !== 'off'
}

type ModuleDb = {
  query: <T>(sql: string, params?: unknown[]) => Promise<T[]>
  exec: (sql: string, params?: unknown[]) => Promise<void>
}

export async function loadContractsMenu(db: Pick<ModuleDb, 'query'>) {
  const rows = await db.query<{ value: string }>('select value from meta where key = ?', [CONTRACTS_MODULE_KEY])
  return contractsMenuOn(rows[0]?.value)
}

export async function saveContractsMenu(db: ModuleDb, on: boolean) {
  await db.exec('insert or replace into meta(key, value) values(?, ?)', [CONTRACTS_MODULE_KEY, on ? 'on' : 'off'])
  return on
}
