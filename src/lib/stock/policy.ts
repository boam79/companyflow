export const STOCK_ALLOW_NEGATIVE_KEY = 'stock_allow_negative'
export const STOCK_ALLOW_OVER_RECEIPT_KEY = 'stock_allow_over_receipt'
export const STOCK_OVERFLOW_REASON_MESSAGE = '초과 사유를 적어 주세요.'

const STOCK_NEGATIVE_ACTIONS = [
  'post_issue',
  'post_outbound',
  'post_supplier_return',
  'transfer_stock',
  'convert_to_asset',
] as const

export type StockPolicy = {
  allowNegative: boolean
  allowOverReceipt: boolean
}

type MetaDb = {
  query: <T>(sql: string, params?: unknown[]) => Promise<T[]>
  exec: (sql: string, params?: unknown[]) => Promise<void>
}

export function defaultStockPolicy(): StockPolicy {
  return { allowNegative: false, allowOverReceipt: false }
}

export function stockAllowOn(value?: string | null) {
  return value?.trim() === 'on'
}

export function stockPolicyCaption(policy: StockPolicy) {
  return `음수 재고 ${policy.allowNegative ? '허용' : '차단'} · 초과 수령 ${policy.allowOverReceipt ? '허용' : '차단'}`
}

export function assertStockOverflow(input: {
  over: boolean
  allowed: boolean
  reason?: string
  blocked: string
}) {
  if (!input.over) return
  if (!input.allowed) throw new Error(input.blocked)
  if (!input.reason?.trim()) throw new Error(STOCK_OVERFLOW_REASON_MESSAGE)
}

export function showsOverflowReason(input: {
  action: string
  qty: number
  onHand: number
  remaining: number
  allowNegative: boolean
  allowOverReceipt: boolean
}) {
  if (!Number.isFinite(input.qty) || input.qty <= 0) return false
  if (input.action === 'post_receipt') {
    return input.allowOverReceipt && input.qty > input.remaining
  }
  if ((STOCK_NEGATIVE_ACTIONS as readonly string[]).includes(input.action)) {
    return input.allowNegative && input.qty > input.onHand
  }
  return false
}

export function stockCommandReason(command: unknown) {
  if (!command || typeof command !== 'object' || !('reason' in command)) return undefined
  const reason = (command as { reason?: unknown }).reason
  return typeof reason === 'string' ? reason.trim() || undefined : undefined
}

export async function loadStockPolicy(db: Pick<MetaDb, 'query'>): Promise<StockPolicy> {
  const [negativeRows, receiptRows] = await Promise.all([
    db.query<{ value: string }>('select value from meta where key = ?', [STOCK_ALLOW_NEGATIVE_KEY]),
    db.query<{ value: string }>('select value from meta where key = ?', [STOCK_ALLOW_OVER_RECEIPT_KEY]),
  ])
  return {
    allowNegative: stockAllowOn(negativeRows[0]?.value),
    allowOverReceipt: stockAllowOn(receiptRows[0]?.value),
  }
}

export async function saveStockPolicy(db: MetaDb, input: StockPolicy): Promise<StockPolicy> {
  const policy: StockPolicy = {
    allowNegative: Boolean(input.allowNegative),
    allowOverReceipt: Boolean(input.allowOverReceipt),
  }
  await db.exec('insert or replace into meta(key, value) values(?, ?)', [
    STOCK_ALLOW_NEGATIVE_KEY,
    policy.allowNegative ? 'on' : 'off',
  ])
  await db.exec('insert or replace into meta(key, value) values(?, ?)', [
    STOCK_ALLOW_OVER_RECEIPT_KEY,
    policy.allowOverReceipt ? 'on' : 'off',
  ])
  return policy
}
