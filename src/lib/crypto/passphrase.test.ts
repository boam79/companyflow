import { describe, expect, it } from 'vitest'
import { decryptWithPassphrase, encryptWithPassphrase } from './passphrase'

describe('백업 암호문', () => {
  it('맞는 암호로만 풀리고 틀린 암호는 원문을 주지 않는다', async () => {
    const envelope = await encryptWithPassphrase('office-key-1', '{"companyId":"hq"}')
    expect(JSON.stringify(envelope)).not.toContain('hq')
    expect(await decryptWithPassphrase('office-key-1', envelope)).toBe('{"companyId":"hq"}')
    await expect(decryptWithPassphrase('wrong-key-9', envelope)).rejects.toThrow(/암호가 맞지/)
  })

  it('짧은 암호는 받지 않는다', async () => {
    await expect(encryptWithPassphrase('short', 'x')).rejects.toThrow(/8자/)
  })
})
