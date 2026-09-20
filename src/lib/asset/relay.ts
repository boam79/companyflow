import type { SupabaseClient } from '@supabase/supabase-js'
import { isQrLabelId } from './qr'
import { assertQrAssetPayload, type QrAssetPayload } from './register'

export type AssetQrLabelRow = {
  id: string
  company_id: string
  status: 'blank' | 'submitted' | 'imported'
  created_at: string
}

export type AssetQrInboxRow = {
  id: string
  company_id: string
  label_id: string
  payload: QrAssetPayload
  submitted_at: string
  imported_at: string | null
}

function asError(error: { message: string } | null) {
  if (!error) return
  throw new Error(error.message)
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

export async function fetchQrLabel(client: SupabaseClient, labelId: string) {
  if (!isQrLabelId(labelId)) return null
  const { data, error } = await client
    .from('asset_qr_labels')
    .select('id, company_id, status, created_at')
    .eq('id', labelId)
    .maybeSingle()
  asError(error)
  return (data as AssetQrLabelRow | null) ?? null
}

export async function fetchPendingQrInbox(client: SupabaseClient, companyId: string) {
  const { data, error } = await client
    .from('asset_qr_inbox')
    .select('id, company_id, label_id, payload, submitted_at, imported_at')
    .eq('company_id', companyId)
    .is('imported_at', null)
    .order('submitted_at', { ascending: true })
  asError(error)
  return (data ?? []) as AssetQrInboxRow[]
}

export async function submitAssetQr(client: SupabaseClient, labelId: string, payload: QrAssetPayload) {
  const body = assertQrAssetPayload(payload)
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
