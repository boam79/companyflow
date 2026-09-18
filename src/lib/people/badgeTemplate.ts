import { badgeLines } from './employment'
import { bytesToBase64, base64ToBytes, hashFileBytes, toArrayBuffer } from '../contracts/book'

export const MAX_BADGE_TEMPLATE_BYTES = 8 * 1024 * 1024
export const CURRENT_BADGE_TEMPLATE_ID = 'current'

export type BadgeFieldKey = 'name' | 'department' | 'title' | 'employeeNo' | 'company'
export type BadgeField = { key: BadgeFieldKey; label: string }
export type BadgeSourceKind = 'pdf' | 'ai-pdf' | 'ai-binary'

export type BadgeInspection = {
  sourceKind: BadgeSourceKind
  extractedText: string
  fields: BadgeField[]
}

export type BadgeTemplateRecord = {
  id: string
  fileName: string
  fileHash: string
  fileMime: string
  sourceKind: BadgeSourceKind
  extractedText: string
  fields: BadgeField[]
  createdAt: string
}

export type BadgeTemplateOriginal = {
  fileName: string
  fileMime: string
  bytes: Uint8Array
}

export const BADGE_TEMPLATE_TABLE_SQL = [
  `create table if not exists badge_templates (
    id text primary key,
    file_name text not null,
    file_hash text not null,
    file_mime text not null,
    file_base64 text not null,
    source_kind text not null,
    extracted_text text,
    fields_json text not null,
    created_at text not null
  )`,
]

const FIELD_HINTS: { key: BadgeFieldKey; labels: string[] }[] = [
  { key: 'company', labels: ['회사명', '회사'] },
  { key: 'department', labels: ['부서', '소속', 'DEPARTMENT', 'Department'] },
  { key: 'name', labels: ['성명', '이름', 'NAME', 'Name'] },
  { key: 'title', labels: ['직위', '직급', '직책', 'TITLE', 'Title'] },
  { key: 'employeeNo', labels: ['사원번호', '사번'] },
]

function extOf(name?: string) {
  return name?.split('.').pop()?.toLowerCase() || ''
}

export function assertBadgeTemplateFile(size: number, mime?: string, fileName?: string): string {
  if (size > MAX_BADGE_TEMPLATE_BYTES) throw new Error('명찰 템플릿은 8MB까지입니다.')
  const ext = extOf(fileName)
  const given = mime && mime !== 'application/octet-stream' ? mime : ''
  if (ext === 'pdf' || given === 'application/pdf') return 'application/pdf'
  if (ext === 'ai' || given === 'application/postscript' || given === 'application/illustrator') {
    return 'application/illustrator'
  }
  throw new Error('명찰 템플릿은 PDF·AI만 받습니다.')
}

export function detectBadgeFields(text: string): BadgeField[] {
  const hits: { key: BadgeFieldKey; label: string; index: number }[] = []
  const used = new Set<BadgeFieldKey>()
  for (const hint of FIELD_HINTS) {
    for (const label of hint.labels) {
      const index = text.indexOf(label)
      if (index < 0) continue
      if (used.has(hint.key)) break
      used.add(hint.key)
      hits.push({ key: hint.key, label, index })
      break
    }
  }
  return hits.sort((a, b) => a.index - b.index).map(({ key, label }) => ({ key, label }))
}

export function applyBadgeLines(
  employee: { name: string; badgeName?: string; title?: string },
  departmentName: string | undefined,
  fields: BadgeField[],
): string[] {
  if (!fields.length) return badgeLines(employee, departmentName)
  const values: Record<BadgeFieldKey, string | undefined> = {
    name: employee.badgeName || employee.name,
    department: departmentName,
    title: employee.title,
    employeeNo: undefined,
    company: undefined,
  }
  const lines = fields
    .map((field) => values[field.key]?.trim())
    .filter((line): line is string => Boolean(line))
  return lines.length ? lines : badgeLines(employee, departmentName)
}

function asLatin1(bytes: Uint8Array) {
  return new TextDecoder('latin1').decode(bytes)
}

export function previewableBadgePdfBytes(bytes: Uint8Array): Uint8Array | undefined {
  const offset = pdfMagicOffset(bytes)
  if (offset < 0) return undefined
  return offset === 0 ? bytes : bytes.subarray(offset)
}

function pdfMagicOffset(bytes: Uint8Array) {
  const limit = Math.min(bytes.length - 4, 4096)
  for (let index = 0; index <= limit; index += 1) {
    if (
      bytes[index] === 0x25 &&
      bytes[index + 1] === 0x50 &&
      bytes[index + 2] === 0x44 &&
      bytes[index + 3] === 0x46
    ) {
      return index
    }
  }
  return -1
}

export function extractPdfLiterals(source: string): string[] {
  const out: string[] = []
  const re = /\((?:\\.|[^\\)])*\)/g
  for (const match of source.matchAll(re)) {
    const inner = match[0].slice(1, -1)
    const decoded = inner
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
      .replace(/\\\(/g, '(')
      .replace(/\\\)/g, ')')
      .replace(/\\\\/g, '\\')
      .replace(/\\(\d{1,3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)))
    const trimmed = decoded.trim()
    if (trimmed.length >= 1 && trimmed.length <= 80) out.push(trimmed)
  }
  return out
}

export function extractPdfHexStrings(source: string): string[] {
  const out: string[] = []
  const re = /<([0-9A-Fa-f \t\r\n]+)>/g
  for (const match of source.matchAll(re)) {
    const clean = match[1].replace(/\s+/g, '')
    if (clean.length < 4 || clean.length % 2) continue
    const bytes = new Uint8Array(clean.length / 2)
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Number.parseInt(clean.slice(index * 2, index * 2 + 2), 16)
    }
    let text = ''
    if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
      text = new TextDecoder('utf-16be').decode(bytes.subarray(2))
    } else if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
      text = new TextDecoder('utf-16le').decode(bytes.subarray(2))
    } else {
      text = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
    }
    const trimmed = text.split('\0').join('').trim()
    if (trimmed.length >= 1 && trimmed.length <= 80) out.push(trimmed)
  }
  return out
}

async function inflateBytes(bytes: Uint8Array) {
  for (const format of ['deflate', 'deflate-raw'] as const) {
    try {
      const stream = new Blob([toArrayBuffer(bytes)]).stream().pipeThrough(new DecompressionStream(format))
      return new Uint8Array(await new Response(stream).arrayBuffer())
    } catch {
      continue
    }
  }
  return null
}

async function extractFlateText(bytes: Uint8Array) {
  const latin = asLatin1(bytes)
  const chunks: string[] = []
  const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g
  for (const match of latin.matchAll(re)) {
    const start = match.index ?? 0
    const header = latin.slice(Math.max(0, start - 180), start)
    if (!/FlateDecode/.test(header)) continue
    const raw = bytes.subarray(start + match[0].indexOf(match[1]), start + match[0].indexOf(match[1]) + match[1].length)
    const inflated = await inflateBytes(raw)
    if (!inflated) continue
    chunks.push(asLatin1(inflated))
    chunks.push(new TextDecoder('utf-8', { fatal: false }).decode(inflated))
  }
  return chunks.join('\n')
}

function summarizeExtracted(text: string, fields: BadgeField[]) {
  const hangul = text.match(/[\uAC00-\uD7A3]{2,20}/g) ?? []
  const unique = [...new Set([...fields.map((field) => field.label), ...hangul])]
  return unique.join(' ').slice(0, 500)
}

export async function inspectBadgeTemplate(bytes: Uint8Array, fileName: string): Promise<BadgeInspection> {
  assertBadgeTemplateFile(bytes.byteLength, undefined, fileName)
  const offset = pdfMagicOffset(bytes)
  const ext = extOf(fileName)
  if (ext === 'pdf' && offset < 0) throw new Error('PDF 형식이 아닙니다.')
  const sourceKind: BadgeSourceKind = offset >= 0 ? (ext === 'ai' ? 'ai-pdf' : 'pdf') : 'ai-binary'
  const pdfBytes = offset > 0 ? bytes.subarray(offset) : bytes
  const parts = [new TextDecoder('utf-8', { fatal: false }).decode(bytes)]
  if (offset >= 0) {
    const latin = asLatin1(pdfBytes)
    parts.push(extractPdfLiterals(latin).join('\n'))
    parts.push(extractPdfHexStrings(latin).join('\n'))
    parts.push(await extractFlateText(pdfBytes))
  }
  const combined = parts.join('\n')
  const fields = detectBadgeFields(combined)
  return {
    sourceKind,
    extractedText: summarizeExtracted(combined, fields),
    fields,
  }
}

export async function loadBadgeTemplate(
  db: { query: <T>(sql: string, params?: unknown[]) => Promise<T[]> },
): Promise<BadgeTemplateRecord | undefined> {
  const rows = await db.query<{
    id: string
    file_name: string
    file_hash: string
    file_mime: string
    source_kind: BadgeSourceKind
    extracted_text?: string | null
    fields_json: string
    created_at: string
  }>(
    `select id, file_name, file_hash, file_mime, source_kind, extracted_text, fields_json, created_at
     from badge_templates where id = ?`,
    [CURRENT_BADGE_TEMPLATE_ID],
  )
  const row = rows[0]
  if (!row) return undefined
  let fields: BadgeField[] = []
  try {
    fields = JSON.parse(row.fields_json) as BadgeField[]
  } catch {
    fields = []
  }
  return {
    id: row.id,
    fileName: row.file_name,
    fileHash: row.file_hash,
    fileMime: row.file_mime,
    sourceKind: row.source_kind,
    extractedText: row.extracted_text || '',
    fields,
    createdAt: row.created_at,
  }
}

export async function loadBadgeTemplateOriginal(
  db: { query: <T>(sql: string, params?: unknown[]) => Promise<T[]> },
): Promise<BadgeTemplateOriginal> {
  const rows = await db.query<{
    file_name: string
    file_mime: string
    file_base64?: string | null
  }>('select file_name, file_mime, file_base64 from badge_templates where id = ?', [CURRENT_BADGE_TEMPLATE_ID])
  const row = rows[0]
  if (!row?.file_base64) throw new Error('올린 명찰 템플릿이 없습니다.')
  return {
    fileName: row.file_name,
    fileMime: row.file_mime,
    bytes: base64ToBytes(row.file_base64),
  }
}

export async function executeSaveBadgeTemplate(
  db: {
    query: <T>(sql: string, params?: unknown[]) => Promise<T[]>
    batch: (statements: { sql: string; params?: unknown[] }[]) => Promise<void>
  },
  command: { operationId: string; fileName: string; fileMime?: string; fileBytes: Uint8Array },
  createdAt = new Date().toISOString(),
): Promise<{ status: 'applied' | 'duplicate'; template: BadgeTemplateRecord }> {
  const existingOps = await db.query<{ operation_id: string }>(
    'select operation_id from processed_operations where operation_id = ?',
    [command.operationId],
  )
  const current = await loadBadgeTemplate(db)
  if (existingOps.length && current) return { status: 'duplicate', template: current }
  const mime = assertBadgeTemplateFile(command.fileBytes.byteLength, command.fileMime, command.fileName)
  const fileHash = await hashFileBytes(command.fileBytes)
  if (current?.fileHash === fileHash) return { status: 'duplicate', template: current }
  const inspected = await inspectBadgeTemplate(command.fileBytes, command.fileName)
  const template: BadgeTemplateRecord = {
    id: CURRENT_BADGE_TEMPLATE_ID,
    fileName: command.fileName,
    fileHash,
    fileMime: mime,
    sourceKind: inspected.sourceKind,
    extractedText: inspected.extractedText,
    fields: inspected.fields,
    createdAt,
  }
  await db.batch([
    {
      sql: 'insert into processed_operations(operation_id, result_json, created_at) values(?, ?, ?)',
      params: [command.operationId, JSON.stringify({ type: 'save_badge_template' }), createdAt],
    },
    {
      sql: `insert or replace into badge_templates(
        id, file_name, file_hash, file_mime, file_base64, source_kind, extracted_text, fields_json, created_at
      ) values(?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        template.id,
        template.fileName,
        template.fileHash,
        template.fileMime,
        bytesToBase64(command.fileBytes),
        template.sourceKind,
        template.extractedText,
        JSON.stringify(template.fields),
        template.createdAt,
      ],
    },
    {
      sql: 'insert into audit_events(id, action, detail_json, created_at) values(?, ?, ?, ?)',
      params: [
        `${command.operationId}:audit`,
        'save_badge_template',
        JSON.stringify({
          fileName: template.fileName,
          fields: template.fields.map((field) => field.label),
          sourceKind: template.sourceKind,
        }),
        createdAt,
      ],
    },
  ])
  return { status: 'applied', template }
}
