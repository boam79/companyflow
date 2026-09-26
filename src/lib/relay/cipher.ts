import { assertQrAssetPayload, type QrAssetPayload } from '../asset/register'
import { assertRelayEnvelope, decryptRelayEnvelope, encryptForRelayPublic, type RelayEnvelope } from '../crypto/ecdh'
import type { ItemRecord } from '../master/book'

export function relayPlaintext(payload: QrAssetPayload) {
  return JSON.stringify(payload)
}

export async function sealQrPayload(publicJwk: JsonWebKey, payload: QrAssetPayload) {
  return encryptForRelayPublic(publicJwk, relayPlaintext(payload))
}

export async function openQrPayload(
  privateJwk: JsonWebKey,
  envelope: unknown,
  items?: ItemRecord[],
): Promise<QrAssetPayload> {
  const parsed = assertRelayEnvelope(envelope)
  const plain = await decryptRelayEnvelope(privateJwk, parsed)
  let body: unknown
  try {
    body = JSON.parse(plain) as unknown
  } catch {
    throw new Error('암호문 내용이 깨졌습니다.')
  }
  return assertQrAssetPayload(body as Partial<QrAssetPayload>, items)
}

export function inboxExpired(expiresAt?: string | null, now = Date.now()) {
  if (!expiresAt) return false
  const at = Date.parse(expiresAt)
  return Number.isFinite(at) && at <= now
}

export function expiredRelayNotice() {
  return '보관 시간이 지나 다시 보내야 합니다.'
}

export type { RelayEnvelope }
