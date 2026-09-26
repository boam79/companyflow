import { describe, expect, it } from 'vitest'
import { generateRelayKeyPair } from '../crypto/ecdh'
import { expiredRelayNotice, inboxExpired, openQrPayload, sealQrPayload } from './cipher'

describe('자산 QR Relay 암호문', () => {
  it('품목·위치는 봉투 밖에 두지 않는다', async () => {
    const keys = await generateRelayKeyPair()
    const envelope = await sealQrPayload(keys.publicJwk, {
      itemName: '책상',
      model: '',
      serialNo: '',
      location: '3층',
      departmentName: '',
      ownerName: '',
      acquiredAt: '',
    })
    expect(JSON.stringify(envelope)).not.toMatch(/책상|3층/)
    const opened = await openQrPayload(keys.privateJwk, envelope)
    expect(opened).toMatchObject({ itemName: '책상', location: '3층' })
  })

  it('만료면 재전송을 안내한다', () => {
    expect(inboxExpired('2026-09-20T00:00:00.000Z', Date.parse('2026-09-26T00:00:00.000Z'))).toBe(true)
    expect(expiredRelayNotice()).toMatch(/다시 보내/)
  })
})
