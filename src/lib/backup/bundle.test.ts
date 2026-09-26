import { describe, expect, it } from 'vitest'
import { openBackup, parseBackupFile, sealBackup } from './bundle'

describe('백업 묶음', () => {
  const snapshot = {
    companyId: 'co-a',
    schemaVersion: 2,
    dumpedAt: '2026-09-26T00:00:00.000Z',
    tables: { meta: [{ key: 'company_id', value: 'co-a' }] },
  }

  it('암호가 틀리거나 다른 회사이면 현재 원본을 건드리지 않는다고 말한다', async () => {
    const file = JSON.stringify(await sealBackup({ passphrase: 'office-key-1', snapshot }))
    expect(file).not.toContain('company_id')
    await expect(
      openBackup({ passphrase: 'wrong-key-9', fileText: file, openCompanyId: 'co-a', currentSchemaVersion: 2 }),
    ).rejects.toThrow(/암호가 맞지/)
    await expect(
      openBackup({ passphrase: 'office-key-1', fileText: file, openCompanyId: 'co-b', currentSchemaVersion: 2 }),
    ).rejects.toThrow(/다른 회사/)
  })

  it('맞는 암호와 같은 회사면 표를 되돌린다', async () => {
    const header = await sealBackup({ passphrase: 'office-key-1', snapshot })
    const opened = await openBackup({
      passphrase: 'office-key-1',
      fileText: JSON.stringify(header),
      openCompanyId: 'co-a',
      currentSchemaVersion: 4,
    })
    expect(opened.tables.meta[0]).toEqual({ key: 'company_id', value: 'co-a' })
    expect(() => parseBackupFile('{"magic":"nope"}')).toThrow(/형식/)
  })
})
