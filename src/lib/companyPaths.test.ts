import { describe, expect, it } from 'vitest'
import { assertCompanyStorageId, companyDbFileName, companyFileDir } from './companyPaths'
import { GUEST_COMPANY_ID } from './guest/ids'

describe('회사 저장 경로', () => {
  it('경로 문자가 있으면 OPFS 파일 이름을 만들지 않는다', () => {
    expect(companyDbFileName('3a27aedf-0ec9-4d28-8724-a80135eaadc3')).toBe(
      'company_3a27aedf-0ec9-4d28-8724-a80135eaadc3.sqlite3',
    )
    expect(companyDbFileName(GUEST_COMPANY_ID)).toBe('company_guest-demo.sqlite3')
    expect(companyFileDir('co-1')).toBe('companyflow/c/co-1/files')
    expect(() => assertCompanyStorageId('../etc/passwd')).toThrow(/표식/)
    expect(() => companyDbFileName('a/b')).toThrow(/표식/)
    expect(() => companyDbFileName('a\\b')).toThrow(/표식/)
    expect(() => companyDbFileName('')).toThrow(/표식/)
  })
})
