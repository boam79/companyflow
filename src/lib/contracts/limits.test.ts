import { describe, expect, it } from 'vitest'
import {
  assertContractMaxMb,
  assertContractMaxPages,
  contractFileLimitBytes,
  contractLimitCaption,
  contractMaxMb,
  contractMaxPages,
  DEFAULT_CONTRACT_MAX_MB,
  DEFAULT_CONTRACT_MAX_PAGES,
  loadContractLimits,
  saveContractLimits,
} from './limits'

describe('계약 원본 한도', () => {
  it('없는 값은 8MB·2쪽으로 둔다', () => {
    expect(contractMaxMb(undefined)).toBe(DEFAULT_CONTRACT_MAX_MB)
    expect(contractMaxPages('9')).toBe(DEFAULT_CONTRACT_MAX_PAGES)
    expect(contractFileLimitBytes()).toBe(8 * 1024 * 1024)
    expect(contractLimitCaption({ maxMb: 8, maxPages: 2 })).toBe('PDF·PNG·JPEG 8MB · OCR 2쪽')
  })

  it('허용 목록만 저장한다', () => {
    expect(assertContractMaxMb(4)).toBe(4)
    expect(assertContractMaxPages(5)).toBe(5)
    expect(() => assertContractMaxMb(16)).toThrow(/2·4·8MB/)
    expect(() => assertContractMaxPages(8)).toThrow(/1·2·3·5/)
  })

  it('회사 원본 meta에 한도를 읽고 쓴다', async () => {
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
    expect(await loadContractLimits(db)).toEqual({ maxMb: 8, maxPages: 2 })
    expect(await saveContractLimits(db, { maxMb: 4, maxPages: 3 })).toEqual({ maxMb: 4, maxPages: 3 })
    expect(await loadContractLimits(db)).toEqual({ maxMb: 4, maxPages: 3 })
  })
})
