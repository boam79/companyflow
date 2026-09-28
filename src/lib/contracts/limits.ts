export const DEFAULT_CONTRACT_MAX_MB = 8
export const DEFAULT_CONTRACT_MAX_PAGES = 2
export const CONTRACT_MAX_MB_KEY = 'contract_max_mb'
export const CONTRACT_MAX_PAGES_KEY = 'contract_ocr_pages'

export const CONTRACT_MAX_MB_CHOICES = [2, 4, 8] as const
export const CONTRACT_MAX_PAGES_CHOICES = [1, 2, 3, 5] as const

export type ContractLimits = {
  maxMb: number
  maxPages: number
}

type MetaDb = {
  query: <T>(sql: string, params?: unknown[]) => Promise<T[]>
  exec: (sql: string, params?: unknown[]) => Promise<void>
}

export function contractMaxMb(value?: string | number | null) {
  const n = typeof value === 'number' ? value : Number(value)
  return CONTRACT_MAX_MB_CHOICES.includes(n as (typeof CONTRACT_MAX_MB_CHOICES)[number])
    ? n
    : DEFAULT_CONTRACT_MAX_MB
}

export function contractMaxPages(value?: string | number | null) {
  const n = typeof value === 'number' ? value : Number(value)
  return CONTRACT_MAX_PAGES_CHOICES.includes(n as (typeof CONTRACT_MAX_PAGES_CHOICES)[number])
    ? n
    : DEFAULT_CONTRACT_MAX_PAGES
}

export function assertContractMaxMb(value: string | number) {
  const n = typeof value === 'number' ? value : Number(value)
  if (!CONTRACT_MAX_MB_CHOICES.includes(n as (typeof CONTRACT_MAX_MB_CHOICES)[number])) {
    throw new Error('원본 용량은 2·4·8MB만 받습니다.')
  }
  return n
}

export function assertContractMaxPages(value: string | number) {
  const n = typeof value === 'number' ? value : Number(value)
  if (!CONTRACT_MAX_PAGES_CHOICES.includes(n as (typeof CONTRACT_MAX_PAGES_CHOICES)[number])) {
    throw new Error('OCR 쪽 수는 1·2·3·5만 받습니다.')
  }
  return n
}

export function contractFileLimitBytes(maxMb = DEFAULT_CONTRACT_MAX_MB) {
  return contractMaxMb(maxMb) * 1024 * 1024
}

export function contractLimitCaption(limits: ContractLimits) {
  return `PDF·PNG·JPEG ${limits.maxMb}MB · OCR ${limits.maxPages}쪽`
}

export async function loadContractLimits(db: Pick<MetaDb, 'query'>): Promise<ContractLimits> {
  const [mbRows, pageRows] = await Promise.all([
    db.query<{ value: string }>('select value from meta where key = ?', [CONTRACT_MAX_MB_KEY]),
    db.query<{ value: string }>('select value from meta where key = ?', [CONTRACT_MAX_PAGES_KEY]),
  ])
  return {
    maxMb: contractMaxMb(mbRows[0]?.value),
    maxPages: contractMaxPages(pageRows[0]?.value),
  }
}

export async function saveContractLimits(db: MetaDb, input: ContractLimits): Promise<ContractLimits> {
  const maxMb = assertContractMaxMb(input.maxMb)
  const maxPages = assertContractMaxPages(input.maxPages)
  await db.exec('insert or replace into meta(key, value) values(?, ?)', [CONTRACT_MAX_MB_KEY, String(maxMb)])
  await db.exec('insert or replace into meta(key, value) values(?, ?)', [CONTRACT_MAX_PAGES_KEY, String(maxPages)])
  return { maxMb, maxPages }
}
