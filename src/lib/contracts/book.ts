import { formatCompanyMoney } from '../company/displayCurrency'
import { DISABLED_OCR, type OcrAdapter } from './ocr'
import { contractWatchLabel } from './watch'

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
  partnerId?: string
  partnerName?: string
  orderId?: string
  fileName?: string
  fileHash?: string
  fileMime?: string
  hasOriginal: boolean
  status: ContractStatus
  ocrStatus: 'off' | 'reviewed'
  createdAt?: string
}

export type SimilarChoice = 'new' | 'revise'

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
  partnerId?: string
  orderId?: string
  fileName?: string
  fileHash?: string
  fileMime?: string
  fileBytes?: Uint8Array
  ocrReviewed?: boolean
  similarChoice?: SimilarChoice
  reviseId?: string
}

export type ContractRevision = {
  id: string
  contractId: string
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
  createdAt: string
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

export function contractAmountText(amount?: number, grouping = true, currency = 'KRW') {
  if (amount == null) return '금액 없음'
  return formatCompanyMoney(amount, grouping, currency)
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
    [row.title, row.contractNo, row.counterparty, row.ownerName, row.fileName, row.partnerName, row.orderId]
      .filter(Boolean)
      .some((value) => value!.toLowerCase().includes(needle)),
  )
}

export type ContractPhase = 'active' | 'due' | 'expired'

export const CONTRACT_SECTIONS: { phase: ContractPhase; label: string }[] = [
  { phase: 'active', label: '계약중' },
  { phase: 'due', label: '만료 예정' },
  { phase: 'expired', label: '만료' },
]

export function contractPhase(endAt?: string, today?: string): ContractPhase {
  const stamp = today ?? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date())
  const watch = contractWatchLabel(endAt, stamp)
  if (watch === '만료') return 'expired'
  if (watch === '만료 예정') return 'due'
  return 'active'
}

export function contractPhaseCaption(phase: ContractPhase) {
  return CONTRACT_SECTIONS.find((section) => section.phase === phase)?.label ?? '계약중'
}

export function emptyContractTabCopy(phase: ContractPhase, query: string) {
  if (query.trim()) return '검색 결과가 없습니다.'
  if (phase === 'expired') return '만료된 계약이 없습니다.'
  if (phase === 'due') return '만료 예정 계약이 없습니다.'
  return '진행 중인 계약이 없습니다.'
}

export function similarDrafts(
  rows: Pick<ContractDraft, 'id' | 'title' | 'counterparty'>[],
  input: { title: string; counterparty: string; id?: string },
) {
  const title = input.title.trim()
  const counterparty = input.counterparty.trim()
  if (!title || !counterparty) return []
  return rows.filter(
    (row) => row.id !== input.id && row.title === title && row.counterparty === counterparty,
  )
}

export function similarChoiceLead(count: number) {
  return count ? '같은 이름·상대 초안이 있습니다. 새 초안인지 개정인지 고르세요.' : ''
}

export function similarDraftNotice(count: number) {
  return similarChoiceLead(count)
}

export function resolveDraftId(
  similar: { id: string }[],
  input: { id: string; similarChoice?: SimilarChoice; reviseId?: string },
) {
  if (!similar.length) {
    if (input.similarChoice === 'revise') throw new Error('개정할 초안이 없습니다.')
    return input.id
  }
  if (!input.similarChoice) throw new Error(similarChoiceLead(similar.length))
  if (input.similarChoice === 'new') return input.id
  if (input.reviseId && similar.some((row) => row.id === input.reviseId)) return input.reviseId
  return similar[0].id
}

export function matchPartnerId(partners: { id: string; name: string }[], counterparty: string) {
  const name = counterparty.trim()
  return partners.find((row) => row.name === name)?.id
}

export function contractOrderLabel(row: { id: string; partnerName?: string; orderDate?: string }) {
  return [row.id, row.partnerName, row.orderDate].filter(Boolean).join(' · ')
}

export function revisionCaption(row: ContractRevision, grouping = true) {
  return `${row.createdAt.slice(0, 10)} · ${contractPeriod(row)} · ${contractAmountText(row.amount, grouping, row.currency)}`
}

export function draftSavedNotice(input: { duplicate: boolean; revised: boolean; hasFile: boolean }) {
  if (input.duplicate) return '같은 초안은 한 번만 반영됩니다.'
  if (input.revised) return '기존 초안을 개정했습니다. OCR로 체결하지 않았습니다.'
  if (input.hasFile) return '확인한 값으로 초안과 원본을 저장했습니다. OCR만으로 체결하지 않았습니다.'
  return '계약 초안을 저장했습니다. OCR로 체결하지 않았습니다.'
}

export function groupContracts(rows: ContractDraft[], today?: string) {
  return CONTRACT_SECTIONS.map((section) => ({
    ...section,
    contracts: rows.filter((row) => contractPhase(row.endAt, today) === section.phase),
  }))
}

export function defaultContractTab(groups: { phase: ContractPhase; contracts: unknown[] }[]): ContractPhase {
  return (
    CONTRACT_SECTIONS.find((section) => groups.find((group) => group.phase === section.phase)?.contracts.length)
      ?.phase ?? 'active'
  )
}

export function mimeFromName(name?: string): string | undefined {
  const ext = name?.split('.').pop()?.toLowerCase()
  return ext ? MIME_BY_EXT[ext] : undefined
}

export function sniffContractFileMime(bytes: Uint8Array): string | undefined {
  if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return 'image/png'
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg'
  }
  if (bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return 'application/pdf'
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp'
  }
  return undefined
}

export function assertContractFile(size: number, mime?: string, fileName?: string, bytes?: Uint8Array): string {
  if (size > MAX_CONTRACT_FILE_BYTES) throw new Error('원본 파일은 8MB까지입니다.')
  const declared =
    (mime && mime !== 'application/octet-stream' ? mime : undefined) || mimeFromName(fileName) || mime || ''
  if (!['application/pdf', 'image/png', 'image/jpeg'].includes(declared)) {
    throw new Error('원본은 PDF·PNG·JPEG만 받습니다.')
  }
  if (bytes && bytes.byteLength) {
    const sniffed = sniffContractFileMime(bytes)
    if (!sniffed || !['application/pdf', 'image/png', 'image/jpeg'].includes(sniffed)) {
      throw new Error('원본 파일 내용이 PDF·PNG·JPEG가 아닙니다.')
    }
    if (sniffed !== declared) {
      throw new Error('원본 파일 내용과 형식이 다릅니다.')
    }
    return sniffed
  }
  return declared
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
    assertContractFile(input.fileBytes.byteLength, input.fileMime, input.fileName, input.fileBytes)
  }
  if (input.fileHash) {
    const dup = existing.find((row) => row.fileHash === input.fileHash && row.id !== input.id)
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
    partnerId: input.partnerId?.trim() || undefined,
    orderId: input.orderId?.trim() || undefined,
    fileName: input.fileName?.trim() || undefined,
    fileHash: input.fileHash || undefined,
    fileMime: input.fileBytes
      ? assertContractFile(input.fileBytes.byteLength, input.fileMime, input.fileName, input.fileBytes)
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
    partner_id text,
    order_id text,
    status text not null,
    ocr_status text not null,
    created_at text not null
  );`,
  `create unique index if not exists contracts_file_hash on contracts(file_hash) where file_hash is not null`,
  `create table if not exists contract_revisions (
    id text primary key,
    contract_id text not null,
    title text not null,
    contract_no text,
    counterparty text not null,
    signed_at text,
    start_at text,
    end_at text,
    amount integer,
    currency text not null,
    owner_name text,
    file_name text,
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
    partner_id?: string | null
    partner_name?: string | null
    order_id?: string | null
    file_name?: string | null
    file_hash?: string | null
    file_mime?: string | null
    has_original?: number | null
    status: ContractStatus
    ocr_status: 'off' | 'reviewed'
    created_at?: string | null
  }>(
    `select c.id, c.title, c.contract_no, c.counterparty, c.signed_at, c.start_at, c.end_at, c.amount, c.currency,
      c.owner_name, c.partner_id, p.name as partner_name, c.order_id, c.file_name, c.file_hash, c.file_mime,
      case when c.file_base64 is not null and length(c.file_base64) > 0 then 1 else 0 end as has_original,
      c.status, c.ocr_status, c.created_at
      from contracts c
      left join partners p on p.id = c.partner_id
      order by c.created_at desc, c.title`,
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
    partnerId: row.partner_id ?? undefined,
    partnerName: row.partner_name ?? undefined,
    orderId: row.order_id ?? undefined,
    fileName: row.file_name ?? undefined,
    fileHash: row.file_hash ?? undefined,
    fileMime: row.file_mime ?? undefined,
    hasOriginal: row.has_original === 1,
    status: row.status,
    ocrStatus: row.ocr_status,
    createdAt: row.created_at ?? undefined,
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

export async function loadContractRevisions(
  db: { query: <T>(sql: string, params?: unknown[]) => Promise<T[]> },
  contractId: string,
): Promise<ContractRevision[]> {
  const rows = await db.query<{
    id: string
    contract_id: string
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
    created_at: string
  }>(
    `select id, contract_id, title, contract_no, counterparty, signed_at, start_at, end_at, amount, currency,
      owner_name, file_name, created_at
      from contract_revisions where contract_id = ? order by created_at desc, id desc`,
    [contractId],
  )
  return rows.map((row) => ({
    id: row.id,
    contractId: row.contract_id,
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
    createdAt: row.created_at,
  }))
}

export async function executeDraftContract(
  db: {
    query: <T>(sql: string, params?: unknown[]) => Promise<T[]>
    batch: (statements: { sql: string; params?: unknown[] }[]) => Promise<void>
  },
  command: { operationId: string } & DraftContractInput,
  createdAt = new Date().toISOString(),
): Promise<{ status: 'applied' | 'duplicate'; id: string; revised: boolean }> {
  const existingOps = await db.query<{ operation_id: string }>(
    'select operation_id from processed_operations where operation_id = ?',
    [command.operationId],
  )
  if (existingOps.length) return { status: 'duplicate', id: command.id, revised: false }
  const existing = await loadContracts(db)
  const similar = similarDrafts(existing, command)
  const id = resolveDraftId(similar, command)
  const previous = command.similarChoice === 'revise' ? existing.find((row) => row.id === id) : undefined
  const draft = applyDraftContract(existing, {
    ...command,
    id,
    partnerId: command.partnerId || previous?.partnerId,
    orderId: command.orderId || previous?.orderId,
  })
  const fileBase64 = command.fileBytes ? bytesToBase64(command.fileBytes) : null
  const revised = Boolean(previous)
  const statements: { sql: string; params?: unknown[] }[] = [
    {
      sql: 'insert into processed_operations(operation_id, result_json, created_at) values(?, ?, ?)',
      params: [command.operationId, JSON.stringify({ type: revised ? 'revise_contract' : 'draft_contract' }), createdAt],
    },
  ]
  if (previous) {
    statements.push({
      sql: `insert into contract_revisions(
        id, contract_id, title, contract_no, counterparty, signed_at, start_at, end_at, amount, currency,
        owner_name, file_name, created_at
      ) values(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        `${command.operationId}:rev`,
        previous.id,
        previous.title,
        previous.contractNo ?? null,
        previous.counterparty,
        previous.signedAt ?? null,
        previous.startAt ?? null,
        previous.endAt ?? null,
        previous.amount ?? null,
        previous.currency,
        previous.ownerName ?? null,
        previous.fileName ?? null,
        createdAt,
      ],
    })
    statements.push({
      sql: `update contracts set
        title = ?, contract_no = ?, counterparty = ?, signed_at = ?, start_at = ?, end_at = ?, amount = ?,
        currency = ?, owner_name = ?, partner_id = ?, order_id = ?,
        file_name = coalesce(?, file_name), file_hash = coalesce(?, file_hash),
        file_mime = coalesce(?, file_mime), file_base64 = coalesce(?, file_base64),
        ocr_status = ?
        where id = ?`,
      params: [
        draft.title,
        draft.contractNo ?? null,
        draft.counterparty,
        draft.signedAt ?? null,
        draft.startAt ?? null,
        draft.endAt ?? null,
        draft.amount ?? null,
        draft.currency,
        draft.ownerName ?? null,
        draft.partnerId ?? null,
        draft.orderId ?? null,
        draft.fileName ?? null,
        draft.fileHash ?? null,
        draft.fileMime ?? null,
        fileBase64,
        command.fileBytes ? draft.ocrStatus : previous.ocrStatus,
        previous.id,
      ],
    })
  } else {
    statements.push({
      sql: `insert into contracts(
        id, title, contract_no, counterparty, signed_at, start_at, end_at, amount, currency,
        owner_name, partner_id, order_id, file_name, file_hash, file_mime, file_base64, status, ocr_status, created_at
      ) values(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        draft.partnerId ?? null,
        draft.orderId ?? null,
        draft.fileName ?? null,
        draft.fileHash ?? null,
        draft.fileMime ?? null,
        fileBase64,
        draft.status,
        draft.ocrStatus,
        createdAt,
      ],
    })
  }
  statements.push({
    sql: 'insert into audit_events(id, action, detail_json, created_at) values(?, ?, ?, ?)',
    params: [
      `${command.operationId}:audit`,
      revised ? 'revise_contract' : 'draft_contract',
      JSON.stringify({ id: draft.id, title: draft.title, hasOriginal: draft.hasOriginal, revised }),
      createdAt,
    ],
  })
  try {
    await db.batch(statements)
    return { status: 'applied', id: draft.id, revised }
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
