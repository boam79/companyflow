import { asBufferSource, base64ToBytes, bytesToBase64, utf8Bytes, utf8Text } from './base64'

export const BACKUP_KDF_ITERATIONS = 210_000
const IV_BYTES = 12
const SALT_BYTES = 16

export type PassphraseEnvelope = {
  v: 1
  kdf: 'PBKDF2-SHA-256'
  iter: number
  salt: string
  iv: string
  ct: string
}

function requireSubtle() {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) throw new Error('이 브라우저는 암호 기능을 지원하지 않습니다.')
  return subtle
}

async function keyFromPassphrase(passphrase: string, salt: Uint8Array, iterations: number) {
  const subtle = requireSubtle()
  const material = await subtle.importKey('raw', asBufferSource(utf8Bytes(passphrase)), 'PBKDF2', false, ['deriveKey'])
  return subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: asBufferSource(salt), iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export function assertBackupPassphrase(passphrase: string) {
  const text = passphrase.trim()
  if (text.length < 8) throw new Error('백업 암호는 8자 이상이어야 합니다.')
  return text
}

export async function encryptWithPassphrase(passphrase: string, plaintext: string): Promise<PassphraseEnvelope> {
  const secret = assertBackupPassphrase(passphrase)
  const subtle = requireSubtle()
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const key = await keyFromPassphrase(secret, salt, BACKUP_KDF_ITERATIONS)
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv: asBufferSource(iv) }, key, asBufferSource(utf8Bytes(plaintext)))
  return {
    v: 1,
    kdf: 'PBKDF2-SHA-256',
    iter: BACKUP_KDF_ITERATIONS,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ct: bytesToBase64(new Uint8Array(ct)),
  }
}

export async function decryptWithPassphrase(passphrase: string, envelope: PassphraseEnvelope): Promise<string> {
  const secret = assertBackupPassphrase(passphrase)
  if (envelope.v !== 1 || envelope.kdf !== 'PBKDF2-SHA-256') {
    throw new Error('이 백업 암호 형식을 모릅니다.')
  }
  const subtle = requireSubtle()
  const key = await keyFromPassphrase(secret, base64ToBytes(envelope.salt), envelope.iter)
  try {
    const pt = await subtle.decrypt(
      { name: 'AES-GCM', iv: asBufferSource(base64ToBytes(envelope.iv)) },
      key,
      asBufferSource(base64ToBytes(envelope.ct)),
    )
    return utf8Text(new Uint8Array(pt))
  } catch {
    throw new Error('백업 암호가 맞지 않습니다. 현재 원본은 그대로입니다.')
  }
}
