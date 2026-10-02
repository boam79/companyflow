import { describe, expect, it } from 'vitest'
import {
  assertStockOverflow,
  defaultStockPolicy,
  loadStockPolicy,
  saveStockPolicy,
  showsOverflowReason,
  stockCommandReason,
  stockPolicyCaption,
  STOCK_OVERFLOW_REASON_MESSAGE,
} from './policy'

describe('재고 한도 정책', () => {
  it('없는 값은 둘 다 차단이다', () => {
    expect(defaultStockPolicy()).toEqual({ allowNegative: false, allowOverReceipt: false })
    expect(stockPolicyCaption(defaultStockPolicy())).toBe('음수 재고 차단 · 초과 수령 차단')
    expect(
      stockPolicyCaption({ allowNegative: true, allowOverReceipt: true }),
    ).toBe('음수 재고 허용 · 초과 수령 허용')
  })

  it('허용일 때만 초과 사유 칸을 연다', () => {
    expect(
      showsOverflowReason({
        action: 'post_issue',
        qty: 8,
        onHand: 7,
        remaining: 0,
        allowNegative: false,
        allowOverReceipt: false,
      }),
    ).toBe(false)
    expect(
      showsOverflowReason({
        action: 'post_issue',
        qty: 8,
        onHand: 7,
        remaining: 0,
        allowNegative: true,
        allowOverReceipt: false,
      }),
    ).toBe(true)
    expect(
      showsOverflowReason({
        action: 'post_receipt',
        qty: 3,
        onHand: 0,
        remaining: 2,
        allowNegative: false,
        allowOverReceipt: true,
      }),
    ).toBe(true)
  })

  it('허용이어도 사유 없이는 막는다', () => {
    expect(() =>
      assertStockOverflow({
        over: true,
        allowed: false,
        blocked: '현재고를 초과해 반출할 수 없습니다.',
      }),
    ).toThrow(/현재고를 초과해 반출/)
    expect(() =>
      assertStockOverflow({
        over: true,
        allowed: true,
        blocked: '현재고를 초과해 반출할 수 없습니다.',
      }),
    ).toThrow(STOCK_OVERFLOW_REASON_MESSAGE)
    expect(() =>
      assertStockOverflow({
        over: true,
        allowed: true,
        reason: '긴급 반출',
        blocked: '현재고를 초과해 반출할 수 없습니다.',
      }),
    ).not.toThrow()
  })

  it('회사 원본 meta에 재고 한도를 읽고 쓴다', async () => {
    const store = new Map<string, string>()
    const db = {
      async query<T>(_sql: string, params?: unknown[]) {
        const key = String(params?.[0] ?? '')
        const value = store.get(key)
        return (value ? [{ value }] : []) as T[]
      },
      async exec(_sql: string, params?: unknown[]) {
        store.set(String(params?.[0]), String(params?.[1]))
      },
    }
    expect(await loadStockPolicy(db)).toEqual(defaultStockPolicy())
    const saved = await saveStockPolicy(db, { allowNegative: true, allowOverReceipt: false })
    expect(saved).toEqual({ allowNegative: true, allowOverReceipt: false })
    expect(await loadStockPolicy(db)).toEqual(saved)
  })

  it('발주 명령에는 사유가 없고 초과 거래만 남긴다', () => {
    expect(stockCommandReason({ type: 'confirm_order', operationId: 'op' })).toBeUndefined()
    expect(
      stockCommandReason({ type: 'post_issue', operationId: 'op', reason: '긴급 반출' }),
    ).toBe('긴급 반출')
  })
})
