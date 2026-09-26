import type { SupabaseClient } from '@supabase/supabase-js'
import { isQrLabelId } from './qr'
import { assertQrAssetPayload, type QrAssetPayload } from './register'
import { assertRelayEnvelope, type RelayEnvelope } from '../crypto/ecdh'
import { expiredRelayNotice, inboxExpired, openQrPayload } from '../relay/cipher'
import type { ItemRecord } from '../master/book'

export type AssetQrLabelRow = {
  id: string
  company_id: string
  status: 'blank' | 'submitted' | 'imported'
  created_at: string
  relayPublicJwk?: JsonWebKey | null
  submittedExpired?: boolean
}

export type AssetQrInboxRow = {
  id: string
  company_id: string
  label_id: string
  payload: QrAssetPayload | Record<string, unknown>
  ciphertext?: RelayEnvelope | null
  submitted_at: string
  imported_at: string | null
  expires_at?: string | null
  expired?: boolean
  preview?: string
}

function asError(error: { message: string } | null) {
  if (!error) return
  throw new Error(error.message)
}

function parsePublicJwk(value: unknown): JsonWebKey | null {
  if (!value) return null
  if (typeof value === 'object') return value as JsonWebKey
  if (typeof value !== 'string') return null
  try {
    return JSON.parse(value) as JsonWebKey
  } catch {
    return null
  }
}

export async function insertBlankQrLabels(
  client: SupabaseClient,
  companyId: string,
  ids: string[],
): Promise<AssetQrLabelRow[]> {
  const rows = ids.map((id) => ({
    id,
    company_id: companyId,
    status: 'blank' as const,
  }))
  const { data, error } = await client.from('asset_qr_labels').insert(rows).select('id, company_id, status, created_at')
  asError(error)
  return (data ?? []) as AssetQrLabelRow[]
}

export async function fetchQrLabel(client: SupabaseClient, labelId: string): Promise<AssetQrLabelRow | null> {
  if (!isQrLabelId(labelId)) return null
  const { data, error } = await client
    .from('asset_qr_labels')
    .select('id, company_id, status, created_at')
    .eq('id', labelId)
    .maybeSingle()
  asError(error)
  if (!data) return null
  const row = data as AssetQrLabelRow
  const [{ data: company }, { data: inbox }] = await Promise.all([
    client.from('companies').select('relay_public_jwk').eq('id', row.company_id).maybeSingle(),
    client
      .from('asset_qr_inbox')
      .select('expires_at, imported_at')
      .eq('label_id', labelId)
      .maybeSingle(),
  ])
  return {
    ...row,
    relayPublicJwk: parsePublicJwk(company?.relay_public_jwk),
    submittedExpired: row.status === 'submitted' && inboxExpired(inbox?.expires_at as string | null),
  }
}

export async function fetchPendingQrInbox(client: SupabaseClient, companyId: string) {
  const { data, error } = await client
    .from('asset_qr_inbox')
    .select('id, company_id, label_id, payload, ciphertext, submitted_at, imported_at, expires_at')
    .eq('company_id', companyId)
    .is('imported_at', null)
    .order('submitted_at', { ascending: true })
  asError(error)
  return ((data ?? []) as AssetQrInboxRow[]).map((row) => ({
    ...row,
    expired: inboxExpired(row.expires_at),
  }))
}

export async function publishRelayPublicKey(client: SupabaseClient, companyId: string, publicJwk: JsonWebKey) {
  const { error } = await client.rpc('publish_relay_public_key', {
    p_company_id: companyId,
    p_jwk: JSON.stringify(publicJwk),
  })
  asError(error)
}

export async function submitAssetQr(client: SupabaseClient, labelId: string, envelope: RelayEnvelope) {
  const body = assertRelayEnvelope(envelope)
  const { data, error } = await client.rpc('submit_asset_qr', {
    p_label_id: labelId,
    p_payload: body,
  })
  asError(error)
  return data
}

export async function importAssetQr(client: SupabaseClient, labelId: string) {
  const { error } = await client.rpc('import_asset_qr', { p_label_id: labelId })
  asError(error)
}

export async function previewInboxRow(
  row: AssetQrInboxRow,
  privateJwk: JsonWebKey | null,
  items: ItemRecord[],
): Promise<AssetQrInboxRow> {
  if (row.expired) {
    return { ...row, preview: expiredRelayNotice() }
  }
  try {
    if (row.ciphertext) {
      if (!privateJwk) return { ...row, preview: '이 PC 수신 키가 없습니다.' }
      const payload = await openQrPayload(privateJwk, row.ciphertext, items)
      return { ...row, payload, preview: `${payload.itemName} · ${payload.location}` }
    }
    const payload = assertQrAssetPayload(row.payload as Partial<QrAssetPayload>, items)
    return { ...row, payload, preview: `${payload.itemName} · ${payload.location}` }
  } catch (error) {
    return { ...row, preview: error instanceof Error ? error.message : '암호문을 열 수 없습니다.' }
  }
}

export { expiredRelayNotice }
