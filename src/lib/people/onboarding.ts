export type OnboardingKey = 'badge' | 'uniform' | 'laptop'

export type OnboardingItem = {
  key: OnboardingKey
  name: string
  hireLabel: string
  leaveLabel: string
}

export const ONBOARDING_ITEMS: OnboardingItem[] = [
  { key: 'badge', name: '명찰', hireLabel: '명찰 지급', leaveLabel: '명찰 회수' },
  { key: 'uniform', name: '유니폼', hireLabel: '유니폼 지급', leaveLabel: '유니폼 회수' },
  { key: 'laptop', name: '노트북', hireLabel: '노트북 지급', leaveLabel: '노트북 회수' },
]

export const PROCESS_ITEM_IDS = ['item-badge', 'item-uniform', 'item-laptop'] as const

const ASSET_ITEM_TO_CHECK: Record<string, OnboardingKey> = {
  'item-badge': 'badge',
  'item-uniform': 'uniform',
  'item-laptop': 'laptop',
}

export function isProcessItemId(itemId: string): boolean {
  return PROCESS_ITEM_IDS.includes(itemId as (typeof PROCESS_ITEM_IDS)[number])
}

export type OnboardingCheck = {
  key: OnboardingKey
  name: string
  hireLabel: string
  leaveLabel: string
  issued: boolean
  issuedAt?: string
  returnedAt?: string
}

export function onboardingView(
  employeeId: string,
  rows: { employeeId: string; itemKey: OnboardingKey; issued: boolean; issuedAt?: string; returnedAt?: string }[],
): OnboardingCheck[] {
  return ONBOARDING_ITEMS.map((item) => {
    const row = rows.find((entry) => entry.employeeId === employeeId && entry.itemKey === item.key)
    return {
      key: item.key,
      name: item.name,
      hireLabel: item.hireLabel,
      leaveLabel: item.leaveLabel,
      issued: Boolean(row?.issued),
      issuedAt: row?.issuedAt,
      returnedAt: row?.returnedAt,
    }
  })
}

export function outstandingOnboarding(checks: OnboardingCheck[]): OnboardingCheck[] {
  return checks.filter((row) => row.issued)
}

export type LeavePhase = 'pending' | 'held' | 'returned'

export function leavePhase(row: OnboardingCheck, left: boolean): LeavePhase {
  if (row.issued) return 'held'
  if (left && row.returnedAt) return 'returned'
  return 'pending'
}

export function leaveSummary(checks: OnboardingCheck[], left: boolean): string {
  const held = outstandingOnboarding(checks).length
  if (held) return `미회수 ${held} · 퇴사 전 회수`
  if (left) return '회수 완료 · 퇴사 기록됨'
  return '지급 전 · 입사 중 프로세스부터'
}

export function applyIssueCheck(checks: OnboardingCheck[], key: OnboardingKey, at: string): OnboardingCheck[] {
  return checks.map((row) =>
    row.key === key ? { ...row, issued: true, issuedAt: at, returnedAt: undefined } : row,
  )
}

export function applyReturnCheck(checks: OnboardingCheck[], key: OnboardingKey, at: string): OnboardingCheck[] {
  const current = checks.find((row) => row.key === key)
  if (!current?.issued) throw new Error(`${current?.name ?? key}은 지급된 상태가 아닙니다.`)
  return checks.map((row) =>
    row.key === key ? { ...row, issued: false, returnedAt: at } : row,
  )
}

export function assertOffboardingClear(checks: OnboardingCheck[]): void {
  const held = outstandingOnboarding(checks)
  if (held.length) {
    throw new Error(`퇴사 프로세스 미완료: ${held.map((row) => row.leaveLabel).join(', ')}를 먼저 하세요.`)
  }
}

export type CheckRow = {
  employeeId: string
  itemKey: OnboardingKey
  issued: boolean
  issuedAt?: string
  returnedAt?: string
}

export async function loadOnboardingChecks(
  db: { query: <T>(sql: string, params?: unknown[]) => Promise<T[]> },
): Promise<CheckRow[]> {
  const rows = await db.query<{
    employee_id: string
    item_key: OnboardingKey
    issued: number
    issued_at?: string | null
    returned_at?: string | null
  }>('select employee_id, item_key, issued, issued_at, returned_at from employment_checks')
  return rows.map((row) => ({
    employeeId: row.employee_id,
    itemKey: row.item_key,
    issued: row.issued === 1,
    issuedAt: row.issued_at ?? undefined,
    returnedAt: row.returned_at ?? undefined,
  }))
}

export async function executeOnboardingToggle(
  db: {
    query: <T>(sql: string, params?: unknown[]) => Promise<T[]>
    batch: (statements: { sql: string; params?: unknown[] }[]) => Promise<void>
  },
  command: { operationId: string; employeeId: string; itemKey: OnboardingKey; issued: boolean },
  at = new Date().toISOString(),
): Promise<{ status: 'applied' | 'duplicate' }> {
  const existing = await db.query<{ operation_id: string }>(
    'select operation_id from processed_operations where operation_id = ?',
    [command.operationId],
  )
  if (existing.length) return { status: 'duplicate' }
  const employees = await db.query<{ id: string; left_at?: string | null }>(
    'select id, left_at from employees where id = ?',
    [command.employeeId],
  )
  if (!employees.length) throw new Error('직원을 찾을 수 없습니다.')
  if (employees[0].left_at && command.issued) {
    throw new Error('퇴사한 직원에게는 입사 지급을 할 수 없습니다. 재입사 뒤에 진행하세요.')
  }
  const checks = onboardingView(command.employeeId, await loadOnboardingChecks(db))
  if (command.issued) applyIssueCheck(checks, command.itemKey, at)
  else applyReturnCheck(checks, command.itemKey, at)
  const day = at.slice(0, 10)
  try {
    await db.batch([
      {
        sql: 'insert into processed_operations(operation_id, result_json, created_at) values(?, ?, ?)',
        params: [command.operationId, JSON.stringify({ type: 'onboarding_check' }), at],
      },
      {
        sql: `insert into employment_checks(employee_id, item_key, issued, issued_at, returned_at, updated_at)
          values(?, ?, ?, ?, ?, ?)
          on conflict(employee_id, item_key) do update set
            issued = excluded.issued,
            issued_at = excluded.issued_at,
            returned_at = excluded.returned_at,
            updated_at = excluded.updated_at`,
        params: [
          command.employeeId,
          command.itemKey,
          command.issued ? 1 : 0,
          command.issued ? day : null,
          command.issued ? null : day,
          at,
        ],
      },
      {
        sql: 'insert into employment_events(id, employee_id, kind, occurred_at, detail_json, created_at) values(?, ?, ?, ?, ?, ?)',
        params: [
          command.operationId,
          command.employeeId,
          command.issued ? `hire_${command.itemKey}` : `leave_${command.itemKey}`,
          day,
          JSON.stringify({ itemKey: command.itemKey }),
          at,
        ],
      },
      {
        sql: 'insert into audit_events(id, action, detail_json, created_at) values(?, ?, ?, ?)',
        params: [
          `${command.operationId}:audit`,
          command.issued ? 'onboarding_issue' : 'offboarding_return',
          JSON.stringify({ employeeId: command.employeeId, itemKey: command.itemKey }),
          at,
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

export async function migrateProcessAssetsToChecks(db: {
  query: <T>(sql: string, params?: unknown[]) => Promise<T[]>
  exec: (sql: string, params?: unknown[]) => Promise<void>
}): Promise<void> {
  const assets = await db.query<{
    id: string
    item_id: string
    status: string
    employee_id?: string | null
  }>('select id, item_id, status, employee_id from assets')
  const now = new Date().toISOString()
  const day = now.slice(0, 10)
  for (const asset of assets) {
    const key = ASSET_ITEM_TO_CHECK[asset.item_id]
    if (!key || asset.status !== 'assigned' || !asset.employee_id) continue
    await db.exec(
      `insert into employment_checks(employee_id, item_key, issued, issued_at, returned_at, updated_at)
        values(?, ?, 1, ?, null, ?)
        on conflict(employee_id, item_key) do update set
          issued = 1,
          issued_at = coalesce(employment_checks.issued_at, excluded.issued_at),
          returned_at = null,
          updated_at = excluded.updated_at`,
      [asset.employee_id, key, day, now],
    )
  }
  await db.exec(
    `delete from assets where item_id in ('item-badge', 'item-uniform', 'item-laptop')`,
  )
  await db.exec(
    `delete from employment_checks
      where issued = 0
        and employee_id in (select id from employees where left_at is null)`,
  )
}
