import { DISABLED_OCR, type OcrAdapter } from './ocr'

export type ContractStatus = 'draft'

export type ContractDraft = {
  id: string
  title: string
  contractNo?: string
  counterparty: string
  signedAt?: string
  startAt?: string
  endAt?: string
  amount?: number
  currency: string
  ownerName?: string
  fileName?: string
  fileHash?: string
  status: ContractStatus
  ocrStatus: 'off'
}

export type DraftContractInput = {
  id: string
  title: string
  contractNo?: string
  counterparty: string
  signedAt?: string
  startAt?: string
  endAt?: string
  amount?: number
  currency?: string
  ownerName?: string
  fileName?: string
  fileHash?: string
}

export function applyDraftContract(
  existing: ContractDraft[],
  input: DraftContractInput,
  ocr: OcrAdapter = DISABLED_OCR,
): ContractDraft {
  const title = input.title.trim()
  const counterparty = input.counterparty.trim()
  if (!title) throw new Error('계약명이 필요합니다.')
  if (!counterparty) throw new Error('계약 상대방이 필요합니다.')
  if (input.startAt && input.endAt && input.endAt < input.startAt) {
    throw new Error('종료일이 시작일보다 빠를 수 없습니다.')
  }
  if (input.amount != null && input.amount < 0) throw new Error('금액은 0 이상이어야 합니다.')
  if (input.fileHash) {
    const dup = existing.find((row) => row.fileHash === input.fileHash)
    if (dup) throw new Error('같은 원본 파일은 계약을 한 번만 만듭니다.')
  }
  if (ocr.enabled) {
    throw new Error('OCR 후보를 확인한 뒤에만 초안을 저장하세요.')
  }
  return {
    id: input.id,
    title,
    contractNo: input.contractNo?.trim() || undefined,
    counterparty,
    signedAt: input.signedAt || undefined,
    startAt: input.startAt || undefined,
    endAt: input.endAt || undefined,
    amount: input.amount,
    currency: input.currency?.trim() || 'KRW',
    ownerName: input.ownerName?.trim() || undefined,
    fileName: input.fileName?.trim() || undefined,
    fileHash: input.fileHash || undefined,
    status: 'draft',
    ocrStatus: 'off',
  }
}

export const CONTRACT_TABLE_SQL = [
  `create table if not exists contracts (
    id text primary key,
    title text not null,
    contract_no text,
    counterparty text not null,
    signed_at text,
    start_at text,
    end_at text,
    amount integer,
    currency text not null default 'KRW',
    owner_name text,
    file_name text,
    file_hash text,
    status text not null,
    ocr_status text not null,
    created_at text not null
  );`,
]

export async function loadContracts(
  db: { query: <T>(sql: string, params?: unknown[]) => Promise<T[]> },
): Promise<ContractDraft[]> {
  const rows = await db.query<{
    id: string
    title: string
    contract_no?: string | null
    counterparty: string
    signed_at?: string | null
    start_at?: string | null
    end_at?: string | null
    amount?: number | null
    currency: string
    owner_name?: string | null
    file_name?: string | null
    file_hash?: string | null
    status: ContractStatus
    ocr_status: 'off'
  }>('select * from contracts order by created_at desc, title')
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    contractNo: row.contract_no ?? undefined,
    counterparty: row.counterparty,
    signedAt: row.signed_at ?? undefined,
    startAt: row.start_at ?? undefined,
    endAt: row.end_at ?? undefined,
    amount: row.amount ?? undefined,
    currency: row.currency,
    ownerName: row.owner_name ?? undefined,
    fileName: row.file_name ?? undefined,
    fileHash: row.file_hash ?? undefined,
    status: row.status,
    ocrStatus: row.ocr_status,
  }))
}

export async function executeDraftContract(
  db: {
    query: <T>(sql: string, params?: unknown[]) => Promise<T[]>
    batch: (statements: { sql: string; params?: unknown[] }[]) => Promise<void>
  },
  command: { operationId: string } & DraftContractInput,
  createdAt = new Date().toISOString(),
): Promise<{ status: 'applied' | 'duplicate' }> {
  const existingOps = await db.query<{ operation_id: string }>(
    'select operation_id from processed_operations where operation_id = ?',
    [command.operationId],
  )
  if (existingOps.length) return { status: 'duplicate' }
  const draft = applyDraftContract(await loadContracts(db), command)
  try {
    await db.batch([
      {
        sql: 'insert into processed_operations(operation_id, result_json, created_at) values(?, ?, ?)',
        params: [command.operationId, JSON.stringify({ type: 'draft_contract' }), createdAt],
      },
      {
        sql: `insert into contracts(
          id, title, contract_no, counterparty, signed_at, start_at, end_at, amount, currency,
          owner_name, file_name, file_hash, status, ocr_status, created_at
        ) values(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [
          draft.id,
          draft.title,
          draft.contractNo ?? null,
          draft.counterparty,
          draft.signedAt ?? null,
          draft.startAt ?? null,
          draft.endAt ?? null,
          draft.amount ?? null,
          draft.currency,
          draft.ownerName ?? null,
          draft.fileName ?? null,
          draft.fileHash ?? null,
          draft.status,
          draft.ocrStatus,
          createdAt,
        ],
      },
      {
        sql: 'insert into audit_events(id, action, detail_json, created_at) values(?, ?, ?, ?)',
        params: [
          `${command.operationId}:audit`,
          'draft_contract',
          JSON.stringify({ id: draft.id, title: draft.title }),
          createdAt,
        ],
      },
    ])
    return { status: 'applied' }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/UNIQUE constraint failed/i.test(message)) return { status: 'duplicate' }
    throw error
  }
}

export async function hashFileBytes(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}
