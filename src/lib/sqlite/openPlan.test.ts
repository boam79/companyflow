import { describe, expect, it } from 'vitest'
import { GUEST_COMPANY_ID } from '../guest/ids'
import { MEMORY_VFS, sqliteOpenMode } from './openPlan'

describe('SQLite 열기 방식', () => {
  it('게스트는 메모리만 쓰고 SAH Pool을 설치하지 않는다', () => {
    expect(sqliteOpenMode({ companyId: GUEST_COMPANY_ID })).toEqual({
      memory: true,
      vfsName: MEMORY_VFS,
      installSah: false,
    })
    expect(sqliteOpenMode({ companyId: 'hq', memory: true }).installSah).toBe(false)
    expect(sqliteOpenMode({ companyId: '3a27aedf-0ec9-4d28-8724-a80135eaadc3' })).toEqual({
      memory: false,
      vfsName: 'opfs-sahpool',
      installSah: true,
    })
  })
})
