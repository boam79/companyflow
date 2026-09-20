import { assertContractFile, base64ToBytes, bytesToBase64 } from '../contracts/book'

export type HireWorkflowRecord = {
  employeeId: string
  ownerId?: string
  ownerName?: string
  dueAt?: string
  fileName?: string
  hasFile: boolean
}

export type HireHistoryItem = {
  at: string
  label: string
}

const HIRE_EVENT_LABELS: Record<string, string> = {
  hire: '입사 저장',
  rehire: '재입사',
  hire_badge: '명찰 지급',
  hire_uniform: '유니폼 지급',
  hire_laptop: '노트북 지급',
}

export const HIRE_WORKFLOW_TABLE_SQL = [
  `create table if not exists employment_workflows (
    employee_id text not null,
    kind text not null,
    owner_id text,
    due_at text,
    file_name text,
    file_mime text,
    file_base64 text,
    updated_at text not null,
    primary key (employee_id, kind)
  )`,
]

export function applyHireWorkflow(
  current: HireWorkflowRecord | undefined,
  patch: {
    employeeId: string
    ownerId?: string
    dueAt?: string
    fileName?: string
    hasFile?: boolean
  },
): HireWorkflowRecord {
  return {
    employeeId: patch.employeeId,
    ownerId: patch.ownerId === undefined ? current?.ownerId : patch.ownerId.trim() || undefined,
    dueAt: patch.dueAt === undefined ? current?.dueAt : patch.dueAt.trim() || undefined,
    fileName: patch.hasFile === false ? undefined : patch.fileName?.trim() || current?.fileName,
    hasFile: patch.hasFile === false ? false : Boolean(patch.hasFile || current?.hasFile),
    ownerName: current?.ownerName,
  }
}

export function hireWorkflowCaption(
  row: { ownerName?: string; dueAt?: string },
  today: string,
): string {
  const parts: string[] = []
  if (row.ownerName?.trim()) parts.push(`담당 ${row.ownerName.trim()}`)
  if (row.dueAt?.trim()) {
    parts.push(`기한 ${row.dueAt.trim()}`)
    if (row.dueAt.trim() < today) parts.push('기한 지남')
  }
  if (!parts.length) return '담당·기한을 저장하세요'
  return parts.join(' · ')
}

export function hireHistory(events: { kind: string; occurredAt: string }[]): HireHistoryItem[] {
  return events
    .filter((row) => HIRE_EVENT_LABELS[row.kind])
    .map((row) => ({ at: row.occurredAt, label: HIRE_EVENT_LABELS[row.kind] }))
}

export async function loadHireWorkflows(
  db: { query: <T>(sql: string, params?: unknown[]) => Promise<T[]> },
): Promise<HireWorkflowRecord[]> {
  const rows = await db.query<{
    employee_id: string
    owner_id?: string | null
    owner_name?: string | null
    due_at?: string | null
    file_name?: string | null
    has_file: number
  }>(
    `select w.employee_id, w.owner_id, e.name as owner_name, w.due_at, w.file_name,
      case when w.file_base64 is not null and length(w.file_base64) > 0 then 1 else 0 end as has_file
     from employment_workflows w
     left join employees e on e.id = w.owner_id
     where w.kind = 'hire'`,
  )
  return rows.map((row) => ({
    employeeId: row.employee_id,
    ownerId: row.owner_id ?? undefined,
    ownerName: row.owner_name ?? undefined,
    dueAt: row.due_at ?? undefined,
    fileName: row.file_name ?? undefined,
    hasFile: row.has_file === 1,
  }))
}

export async function loadHireEvents(
  db: { query: <T>(sql: string, params?: unknown[]) => Promise<T[]> },
): Promise<{ employeeId: string; kind: string; occurredAt: string }[]> {
  const rows = await db.query<{ employee_id: string; kind: string; occurred_at: string }>(
    'select employee_id, kind, occurred_at from employment_events order by occurred_at, created_at',
  )
  return rows.map((row) => ({
    employeeId: row.employee_id,
    kind: row.kind,
    occurredAt: row.occurred_at,
  }))
}

export async function loadHireWorkflowFile(
  db: { query: <T>(sql: string, params?: unknown[]) => Promise<T[]> },
  employeeId: string,
): Promise<{ fileName: string; fileMime: string; bytes: Uint8Array }> {
  const rows = await db.query<{ file_name?: string | null; file_mime?: string | null; file_base64?: string | null }>(
    `select file_name, file_mime, file_base64 from employment_workflows where employee_id = ? and kind = 'hire'`,
    [employeeId],
  )
  const row = rows[0]
  if (!row?.file_base64 || !row.file_name) throw new Error('입사 첨부 파일이 없습니다.')
  return {
    fileName: row.file_name,
    fileMime: row.file_mime || 'application/octet-stream',
    bytes: base64ToBytes(row.file_base64),
  }
}

export async function executeSaveHireWorkflow(
  db: {
    query: <T>(sql: string, params?: unknown[]) => Promise<T[]>
    batch: (statements: { sql: string; params?: unknown[] }[]) => Promise<void>
  },
  command: {
    operationId: string
    employeeId: string
    ownerId?: string
    dueAt?: string
    fileName?: string
    fileMime?: string
    fileBytes?: Uint8Array
  },
  createdAt = new Date().toISOString(),
): Promise<{ status: 'applied' | 'duplicate' }> {
  const existing = await db.query<{ operation_id: string }>(
    'select operation_id from processed_operations where operation_id = ?',
    [command.operationId],
  )
  if (existing.length) return { status: 'duplicate' }
  const employees = await db.query<{ id: string }>(
    'select id from employees where id = ?',
    [command.employeeId],
  )
  if (!employees.length) throw new Error('직원을 찾을 수 없습니다.')
  if (command.ownerId) {
    const owners = await db.query<{ id: string }>('select id from employees where id = ?', [command.ownerId])
    if (!owners.length) throw new Error('담당자를 찾을 수 없습니다.')
  }
  const current = (await loadHireWorkflows(db)).find((row) => row.employeeId === command.employeeId)
  const next = applyHireWorkflow(current, {
    employeeId: command.employeeId,
    ownerId: command.ownerId,
    dueAt: command.dueAt,
    fileName: command.fileName,
    hasFile: command.fileBytes ? true : undefined,
  })
  let fileName = current?.fileName ?? null
  let fileMime: string | null = null
  let fileBase64: string | null = null
  let keepFile = !command.fileBytes
  if (command.fileBytes) {
    fileMime = assertContractFile(command.fileBytes.byteLength, command.fileMime, command.fileName)
    fileName = command.fileName?.trim() || '입사첨부'
    fileBase64 = bytesToBase64(command.fileBytes)
    keepFile = false
  }
  try {
    await db.batch([
      {
        sql: 'insert into processed_operations(operation_id, result_json, created_at) values(?, ?, ?)',
        params: [command.operationId, JSON.stringify({ type: 'hire_workflow' }), createdAt],
      },
      {
        sql: keepFile
          ? `insert into employment_workflows(employee_id, kind, owner_id, due_at, file_name, file_mime, file_base64, updated_at)
              values(?, 'hire', ?, ?, ?, ?, ?, ?)
              on conflict(employee_id, kind) do update set
                owner_id = excluded.owner_id,
                due_at = excluded.due_at,
                updated_at = excluded.updated_at`
          : `insert into employment_workflows(employee_id, kind, owner_id, due_at, file_name, file_mime, file_base64, updated_at)
              values(?, 'hire', ?, ?, ?, ?, ?, ?)
              on conflict(employee_id, kind) do update set
                owner_id = excluded.owner_id,
                due_at = excluded.due_at,
                file_name = excluded.file_name,
                file_mime = excluded.file_mime,
                file_base64 = excluded.file_base64,
                updated_at = excluded.updated_at`,
        params: keepFile
          ? [command.employeeId, next.ownerId ?? null, next.dueAt ?? null, null, null, null, createdAt]
          : [command.employeeId, next.ownerId ?? null, next.dueAt ?? null, fileName, fileMime, fileBase64, createdAt],
      },
    ])
    return { status: 'applied' }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/UNIQUE constraint failed/i.test(message)) return { status: 'duplicate' }
    throw error
  }
}
