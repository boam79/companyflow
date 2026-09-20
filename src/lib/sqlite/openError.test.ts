import { describe, expect, it } from 'vitest'
import { explainSqliteOpenError, isSahHandleBusy } from './openError'
import { getCompanySqlite, getGuestSqlite } from './instance'

describe('OPFS 열기 오류', () => {
  it('Access Handle 충돌을 한글로 안내한다', () => {
    const raw =
      "Failed to execute 'createSyncAccessHandle' on 'FileSystemFileHandle': Access Handles cannot be created if there is another open Access Handle or Writable stream associated with the same file"
    expect(isSahHandleBusy(raw)).toBe(true)
    expect(explainSqliteOpenError(new Error(raw))).toMatch(/하나만 남기고/)
  })

  it('앱 전역 SQLite 연결은 하나다', () => {
    expect(getCompanySqlite()).toBe(getCompanySqlite())
  })

  it('게스트 SQLite는 본사 연결과 다른 인스턴스다', () => {
    expect(getGuestSqlite()).toBe(getGuestSqlite())
    expect(getGuestSqlite()).not.toBe(getCompanySqlite())
  })
})
