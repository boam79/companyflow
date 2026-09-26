import { asBufferSource, base64ToBytes, bytesToBase64, utf8Bytes, utf8Text } from './base64'

export const RELAY_ALG = 'ECDH-ES+A256GCM'
export const RELAY_INFO = 'companyflow-relay-v1'

export type RelayEnvelope = {
  v: 1
  alg: typeof RELAY_ALG
  epk: JsonWebKey
  iv: string
  ct: string
}

function requireSubtle() {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) throw new Error('이 브라우저는 암호 기능을 지원하지 않습니다.')
  return subtle
}

export async function generateRelayKeyPair() {
  const subtle = requireSubtle()
  const pair = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  const publicJwk = await subtle.exportKey('jwk', pair.publicKey)
  const privateJwk = await subtle.exportKey('jwk', pair.privateKey)
  return { publicJwk, privateJwk }
}

async function importPublic(jwk: JsonWebKey) {
  return requireSubtle().importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
}

async function importPrivate(jwk: JsonWebKey) {
  return requireSubtle().importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits'])
}

async function aesFromShared(shared: ArrayBuffer) {
  const subtle = requireSubtle()
  const hkdf = await subtle.importKey('raw', shared, 'HKDF', false, ['deriveKey'])
  return subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: asBufferSource(utf8Bytes(RELAY_INFO)), info: asBufferSource(utf8Bytes(RELAY_INFO)) },
    hkdf,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export function assertRelayEnvelope(value: unknown): RelayEnvelope {
  const row = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  if (row.v !== 1 || row.alg !== RELAY_ALG || !row.epk || typeof row.iv !== 'string' || typeof row.ct !== 'string') {
    throw new Error('암호문 형식이 아닙니다.')
  }
  if ('itemName' in row || 'location' in row || 'payload' in row) {
    throw new Error('업무 내용은 암호문으로만 받습니다.')
  }
  return {
    v: 1,
    alg: RELAY_ALG,
    epk: row.epk as JsonWebKey,
    iv: row.iv,
    ct: row.ct,
  }
}

export async function encryptForRelayPublic(publicJwk: JsonWebKey, plaintext: string): Promise<RelayEnvelope> {
  const subtle = requireSubtle()
  const recipient = await importPublic(publicJwk)
  const ephemeral = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  const shared = await subtle.deriveBits({ name: 'ECDH', public: recipient }, ephemeral.privateKey, 256)
  const key = await aesFromShared(shared)
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12))
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv: asBufferSource(iv) }, key, asBufferSource(utf8Bytes(plaintext)))
  return {
    v: 1,
    alg: RELAY_ALG,
    epk: await subtle.exportKey('jwk', ephemeral.publicKey),
    iv: bytesToBase64(iv),
    ct: bytesToBase64(new Uint8Array(ct)),
  }
}

export async function decryptRelayEnvelope(privateJwk: JsonWebKey, envelope: RelayEnvelope): Promise<string> {
  const subtle = requireSubtle()
  const parsed = assertRelayEnvelope(envelope)
  const self = await importPrivate(privateJwk)
  const eph = await importPublic(parsed.epk)
  const shared = await subtle.deriveBits({ name: 'ECDH', public: eph }, self, 256)
  const key = await aesFromShared(shared)
  try {
    const pt = await subtle.decrypt(
      { name: 'AES-GCM', iv: asBufferSource(base64ToBytes(parsed.iv)) },
      key,
      asBufferSource(base64ToBytes(parsed.ct)),
    )
    return utf8Text(new Uint8Array(pt))
  } catch {
    throw new Error('이 PC 수신 키로 암호문을 풀 수 없습니다.')
  }
}
