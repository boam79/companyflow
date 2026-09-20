import {
  loadOnboardingChecks,
  onboardingView,
  assertOffboardingClear,
  type CheckRow,
  type OnboardingCheck,
  type OnboardingKey,
} from './onboarding'

export type EmployeeRecord = {
  id: string
  name: string
  departmentId?: string
  title?: string
  hiredAt?: string
  leftAt?: string
  badgeName?: string
  badgeDepartment?: string
}

export function isActiveEmployee(employee: EmployeeRecord): boolean {
  return !employee.leftAt
}

export type RosterPhase = 'joining' | 'employed' | 'left'

export const ROSTER_SECTIONS: { phase: RosterPhase; label: string }[] = [
  { phase: 'joining', label: '입사 중' },
  { phase: 'employed', label: '재직' },
  { phase: 'left', label: '퇴사' },
]

export function hireIssuedCount(checks: OnboardingCheck[]): number {
  return checks.filter((row) => row.issued).length
}

export function rosterPhase(employee: EmployeeRecord, checks: OnboardingCheck[]): RosterPhase {
  if (employee.leftAt) return 'left'
  if (!employee.hiredAt || hireIssuedCount(checks) < checks.length) return 'joining'
  return 'employed'
}

export function rosterCaption(employee: EmployeeRecord, checks: OnboardingCheck[]): string {
  const phase = rosterPhase(employee, checks)
  const issued = hireIssuedCount(checks)
  if (phase === 'left') return `퇴사 ${employee.leftAt}`
  if (!employee.hiredAt) return `입사 전 · ${issued}/3 지급`
  if (phase === 'joining') return `입사 중 · ${issued}/3 지급`
  return `재직 · ${employee.hiredAt}`
}

export type HireProcessStep = {
  key: 'record' | OnboardingKey
  label: string
  done: boolean
}

export function hireProcessSteps(employee: EmployeeRecord, checks: OnboardingCheck[]): HireProcessStep[] {
  return [
    { key: 'record', label: '입사 저장', done: Boolean(employee.hiredAt) && !employee.leftAt },
    ...checks.map((row) => ({ key: row.key, label: row.hireLabel, done: row.issued })),
  ]
}

export function hireProcessSummary(employee: EmployeeRecord, checks: OnboardingCheck[]): string {
  const steps = hireProcessSteps(employee, checks)
  const done = steps.filter((step) => step.done).length
  if (employee.leftAt) return '퇴사 · 입사 프로세스 종료'
  if (rosterPhase(employee, checks) === 'employed') return '입사 완료 · 3/3 지급'
  return `입사 중 · ${done}/4`
}

export function groupRoster(employees: EmployeeRecord[], checkRows: CheckRow[]) {
  return ROSTER_SECTIONS.map((section) => ({
    ...section,
    employees: employees.filter(
      (row) => rosterPhase(row, onboardingView(row.id, checkRows)) === section.phase,
    ),
  }))
}

export function employeeHireDraft(
  row: EmployeeRecord,
  departments: { id: string; name: string }[],
  today: string,
) {
  return {
    hiredAt: row.leftAt ? today : row.hiredAt || today,
    title: row.title || '',
    badgeName: row.badgeName || row.name,
    department:
      row.badgeDepartment ||
      departments.find((dept) => dept.id === row.departmentId)?.name ||
      '',
  }
}

export function applyHire(
  employee: EmployeeRecord,
  command: { hiredAt: string; title?: string; badgeName?: string; department?: string },
): EmployeeRecord {
  if (!command.hiredAt.trim()) throw new Error('입사일이 필요합니다.')
  return {
    ...employee,
    leftAt: undefined,
    hiredAt: command.hiredAt,
    title: command.title?.trim() || employee.title,
    badgeName: command.badgeName?.trim() || employee.badgeName || employee.name,
    badgeDepartment: command.department?.trim() || employee.badgeDepartment,
  }
}

export function applyLeave(employee: EmployeeRecord, leftAt: string): EmployeeRecord {
  if (employee.leftAt) throw new Error('이미 퇴사했습니다.')
  if (!leftAt.trim()) throw new Error('퇴사일이 필요합니다.')
  return { ...employee, leftAt }
}

export function badgeLines(
  employee: Pick<EmployeeRecord, 'name' | 'badgeName' | 'title'>,
  departmentName?: string,
): string[] {
  return [employee.badgeName || employee.name, departmentName, employee.title].filter(
    (line): line is string => Boolean(line?.trim()),
  )
}

export async function loadEmployees(
  db: { query: <T>(sql: string, params?: unknown[]) => Promise<T[]> },
): Promise<EmployeeRecord[]> {
  const rows = await db.query<{
    id: string
    name: string
    department_id?: string | null
    title?: string | null
    hired_at?: string | null
    left_at?: string | null
    badge_name?: string | null
    badge_department?: string | null
  }>(
    'select id, name, department_id, title, hired_at, left_at, badge_name, badge_department from employees order by name',
  )
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    departmentId: row.department_id ?? undefined,
    title: row.title ?? undefined,
    hiredAt: row.hired_at ?? undefined,
    leftAt: row.left_at ?? undefined,
    badgeName: row.badge_name ?? undefined,
    badgeDepartment: row.badge_department ?? undefined,
  }))
}

export async function executeHire(
  db: {
    query: <T>(sql: string, params?: unknown[]) => Promise<T[]>
    batch: (statements: { sql: string; params?: unknown[] }[]) => Promise<void>
  },
  command: {
    operationId: string
    employeeId: string
    hiredAt: string
    title?: string
    badgeName?: string
    department?: string
  },
  createdAt = new Date().toISOString(),
): Promise<{ status: 'applied' | 'duplicate' }> {
  return runEmployeeCommand(db, command.operationId, 'hire_employee', createdAt, async () => {
    const employees = await loadEmployees(db)
    const employee = employees.find((row) => row.id === command.employeeId)
    if (!employee) throw new Error('직원을 찾을 수 없습니다.')
    const next = applyHire(employee, command)
    const statements = [
      {
        sql: 'update employees set hired_at = ?, left_at = null, title = ?, badge_name = ?, badge_department = ? where id = ?',
        params: [
          next.hiredAt,
          next.title ?? null,
          next.badgeName ?? next.name,
          next.badgeDepartment ?? null,
          command.employeeId,
        ],
      },
      {
        sql: 'insert into employment_events(id, employee_id, kind, occurred_at, detail_json, created_at) values(?, ?, ?, ?, ?, ?)',
        params: [
          command.operationId,
          command.employeeId,
          employee.leftAt ? 'rehire' : 'hire',
          command.hiredAt,
          JSON.stringify({ title: next.title, badgeName: next.badgeName, department: next.badgeDepartment }),
          createdAt,
        ],
      },
    ]
    if (employee.leftAt) {
      statements.push({
        sql: 'delete from employment_checks where employee_id = ?',
        params: [command.employeeId],
      })
    }
    return statements
  })
}

export async function executeLeave(
  db: {
    query: <T>(sql: string, params?: unknown[]) => Promise<T[]>
    batch: (statements: { sql: string; params?: unknown[] }[]) => Promise<void>
  },
  command: { operationId: string; employeeId: string; leftAt: string },
  createdAt = new Date().toISOString(),
): Promise<{ status: 'applied' | 'duplicate' }> {
  return runEmployeeCommand(db, command.operationId, 'leave_employee', createdAt, async () => {
    const [employees, checkRows] = await Promise.all([loadEmployees(db), loadOnboardingChecks(db)])
    const employee = employees.find((row) => row.id === command.employeeId)
    if (!employee) throw new Error('직원을 찾을 수 없습니다.')
    assertOffboardingClear(onboardingView(command.employeeId, checkRows))
    const next = applyLeave(employee, command.leftAt)
    return [
      {
        sql: 'update employees set left_at = ? where id = ?',
        params: [next.leftAt, command.employeeId],
      },
      {
        sql: 'insert into employment_events(id, employee_id, kind, occurred_at, detail_json, created_at) values(?, ?, ?, ?, ?, ?)',
        params: [
          command.operationId,
          command.employeeId,
          'leave',
          command.leftAt,
          JSON.stringify({}),
          createdAt,
        ],
      },
    ]
  })
}

async function runEmployeeCommand(
  db: {
    query: <T>(sql: string, params?: unknown[]) => Promise<T[]>
    batch: (statements: { sql: string; params?: unknown[] }[]) => Promise<void>
  },
  operationId: string,
  action: string,
  createdAt: string,
  statements: () => Promise<{ sql: string; params?: unknown[] }[]>,
): Promise<{ status: 'applied' | 'duplicate' }> {
  const existing = await db.query<{ operation_id: string }>(
    'select operation_id from processed_operations where operation_id = ?',
    [operationId],
  )
  if (existing.length) return { status: 'duplicate' }
  const extra = await statements()
  try {
    await db.batch([
      {
        sql: 'insert into processed_operations(operation_id, result_json, created_at) values(?, ?, ?)',
        params: [operationId, JSON.stringify({ type: action }), createdAt],
      },
      ...extra,
      {
        sql: 'insert into audit_events(id, action, detail_json, created_at) values(?, ?, ?, ?)',
        params: [`${operationId}:audit`, action, JSON.stringify({ operationId }), createdAt],
      },
    ])
    return { status: 'applied' }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/UNIQUE constraint failed/i.test(message)) return { status: 'duplicate' }
    throw error
  }
}
