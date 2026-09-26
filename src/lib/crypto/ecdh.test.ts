import { describe, expect, it } from 'vitest'
import { assertRelayEnvelope, decryptRelayEnvelope, encryptForRelayPublic, generateRelayKeyPair } from './ecdh'

describe('Relay ECDH 봉투', () => {
  it('지정 PC 비밀키로만 업무 내용을 푼다', async () => {
    const origin = await generateRelayKeyPair()
    const other = await generateRelayKeyPair()
    const envelope = await encryptForRelayPublic(origin.publicJwk, '{"itemName":"책상","location":"3층"}')
    expect(JSON.stringify(envelope)).not.toMatch(/책상|3층/)
    expect(assertRelayEnvelope(envelope).alg).toBe('ECDH-ES+A256GCM')
    expect(await decryptRelayEnvelope(origin.privateJwk, envelope)).toBe('{"itemName":"책상","location":"3층"}')
    await expect(decryptRelayEnvelope(other.privateJwk, envelope)).rejects.toThrow(/수신 키/)
  })

  it('평문 필드가 있으면 암호문으로 보지 않는다', () => {
    expect(() => assertRelayEnvelope({ v: 1, alg: 'ECDH-ES+A256GCM', epk: {}, iv: 'a', ct: 'b', itemName: '책상' })).toThrow(
      /암호문으로만/,
    )
  })
})
