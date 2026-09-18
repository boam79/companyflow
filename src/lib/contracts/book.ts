import { DISABLED_OCR, type OcrAdapter } from './ocr'

export type ContractStatus = 'draft'

export const MAX_CONTRACT_FILE_BYTES = 8 * 1024 * 1024

const MIME_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
}

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
  fileMime?: string
  hasOriginal: boolean
  status: ContractStatus
  ocrStatus: 'off' | 'reviewed'
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
  fileMime?: string
  fileBytes?: Uint8Array
  ocrReviewed?: boolean
}

export type ContractOriginal = {
  id: string
  fileName: string
  fileMime: string
  bytes: Uint8Array
}

export function contractPeriod(row: { startAt?: string; endAt?: string }) {
  if (!row.startAt && !row.endAt) return '기간 없음'
  return [row.startAt, row.endAt].filter(Boolean).join(' ~ ')
}

export function contractAmountText(amount?: number) {
  if (amount == null) return '금액 없음'
  return `${amount.toLocaleString('ko-KR')}원`
}

export function contractLife(endAt?: string, today?: string) {
  if (!endAt) return '진행'
  return endAt < (today ?? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date()))
    ? '종료'
    : '진행'
}

export function filterContracts(rows: ContractDraft[], query: string) {
  const needle = query.trim().toLowerCase()
  if (!needle) return rows
  return rows.filter((row) =>
    [row.title, row.contractNo, row.counterparty, row.ownerName, row.fileName]
      .filter(Boolean)
      .some((value) => value!.toLowerCase().includes(needle)),
  )
}

export function mimeFromName(name?: string): string | undefined {
  const ext = name?.split('.').pop()?.toLowerCase()
  return ext ? MIME_BY_EXT[ext] : undefined
}

export function assertContractFile(size: number, mime?: string, fileName?: string): string {
  if (size > MAX_CONTRACT_FILE_BYTES) throw new Error('원본 파일은 8MB까지입니다.')
  const resolved =
    (mime && mime !== 'application/octet-stream' ? mime : undefined) || mimeFromName(fileName) || mime || ''
  if (!['application/pdf', 'image/png', 'image/jpeg'].includes(resolved)) {
    throw new Error('원본은 PDF·PNG·JPEG만 받습니다.')
  }
  return resolved
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk))
  }
  return btoa(binary)
}

export function base64ToBytes(text: string): Uint8Array {
  const binary = atob(text)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
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
  if (input.fileBytes) {
    assertContractFile(input.fileBytes.byteLength, input.fileMime, input.fileName)
  }
  if (input.fileHash) {
    const dup = existing.find((row) => row.fileHash === input.fileHash)
    if (dup) throw new Error('같은 원본 파일은 계약을 한 번만 만듭니다.')
  }
  if (ocr.enabled && input.fileBytes && !input.ocrReviewed) {
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
    fileMime: input.fileBytes
      ? assertContractFile(input.fileBytes.byteLength, input.fileMime, input.fileName)
      : input.fileMime,
    hasOriginal: Boolean(input.fileBytes?.byteLength),
    status: 'draft',
    ocrStatus: input.ocrReviewed ? 'reviewed' : 'off',
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
    file_mime text,
    file_base64 text,
    status text not null,
    ocr_status text not null,
    created_at text not null
  );`,
  `create unique index if not exists contracts_file_hash on contracts(file_hash) where file_hash is not null`,
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
    file_mime?: string | null
    has_original?: number | null
    status: ContractStatus
    ocr_status: 'off' | 'reviewed'
  }>(
    `select id, title, contract_no, counterparty, signed_at, start_at, end_at, amount, currency,
      owner_name, file_name, file_hash, file_mime,
      case when file_base64 is not null and length(file_base64) > 0 then 1 else 0 end as has_original,
      status, ocr_status
      from contracts order by created_at desc, title`,
  )
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
    fileMime: row.file_mime ?? undefined,
    hasOriginal: row.has_original === 1,
    status: row.status,
    ocrStatus: row.ocr_status,
  }))
}

export async function loadContractOriginal(
  db: { query: <T>(sql: string, params?: unknown[]) => Promise<T[]> },
  id: string,
): Promise<ContractOriginal> {
  const rows = await db.query<{
    id: string
    file_name?: string | null
    file_mime?: string | null
    file_base64?: string | null
  }>('select id, file_name, file_mime, file_base64 from contracts where id = ?', [id])
  const row = rows[0]
  if (!row?.file_base64 || !row.file_name) throw new Error('원본 파일이 없습니다.')
  return {
    id: row.id,
    fileName: row.file_name,
    fileMime: row.file_mime || mimeFromName(row.file_name) || 'application/octet-stream',
    bytes: base64ToBytes(row.file_base64),
  }
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
  const fileBase64 = command.fileBytes ? bytesToBase64(command.fileBytes) : null
  try {
    await db.batch([
      {
        sql: 'insert into processed_operations(operation_id, result_json, created_at) values(?, ?, ?)',
        params: [command.operationId, JSON.stringify({ type: 'draft_contract' }), createdAt],
      },
      {
        sql: `insert into contracts(
          id, title, contract_no, counterparty, signed_at, start_at, end_at, amount, currency,
          owner_name, file_name, file_hash, file_mime, file_base64, status, ocr_status, created_at
        ) values(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          draft.fileMime ?? null,
          fileBase64,
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
          JSON.stringify({ id: draft.id, title: draft.title, hasOriginal: draft.hasOriginal }),
          createdAt,
        ],
      },
    ])
    return { status: 'applied' }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/UNIQUE constraint failed/i.test(message)) {
      throw new Error('같은 원본 파일은 계약을 한 번만 만듭니다.')
    }
    throw error
  }
}

export function toArrayBuffer(bytes: ArrayBuffer | Uint8Array): ArrayBuffer {
  const source = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  const copy = new Uint8Array(source.byteLength)
  copy.set(source)
  return copy.buffer.slice(0)
}

export async function hashFileBytes(bytes: ArrayBuffer | Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', toArrayBuffer(bytes))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}
