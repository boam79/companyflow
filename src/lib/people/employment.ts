import { loadAssets, type AssetRecord } from '../asset/book'

export type EmployeeRecord = {
  id: string
  name: string
  departmentId?: string
  title?: string
  hiredAt?: string
  leftAt?: string
  badgeName?: string
}

export function isActiveEmployee(employee: EmployeeRecord): boolean {
  return !employee.leftAt
}

export function applyHire(
  employee: EmployeeRecord,
  command: { hiredAt: string; title?: string; badgeName?: string },
): EmployeeRecord {
  if (employee.leftAt) throw new Error('퇴사한 직원은 다시 입사 처리할 수 없습니다.')
  if (!command.hiredAt.trim()) throw new Error('입사일이 필요합니다.')
  return {
    ...employee,
    hiredAt: command.hiredAt,
    title: command.title?.trim() || employee.title,
    badgeName: command.badgeName?.trim() || employee.badgeName || employee.name,
  }
}

export function applyLeave(
  employee: EmployeeRecord,
  assets: AssetRecord[],
  leftAt: string,
): EmployeeRecord {
  if (employee.leftAt) throw new Error('이미 퇴사했습니다.')
  if (!leftAt.trim()) throw new Error('퇴사일이 필요합니다.')
  const held = assets.filter((asset) => asset.status === 'assigned' && asset.employeeId === employee.id)
  if (held.length) {
    throw new Error(`미회수 자산 ${held.length}건이 있어 퇴사할 수 없습니다.`)
  }
  return { ...employee, leftAt }
}

export function badgeLines(employee: EmployeeRecord, departmentName?: string): string[] {
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
  }>(
    'select id, name, department_id, title, hired_at, left_at, badge_name from employees order by name',
  )
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    departmentId: row.department_id ?? undefined,
    title: row.title ?? undefined,
    hiredAt: row.hired_at ?? undefined,
    leftAt: row.left_at ?? undefined,
    badgeName: row.badge_name ?? undefined,
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
  },
  createdAt = new Date().toISOString(),
): Promise<{ status: 'applied' | 'duplicate' }> {
  return runEmployeeCommand(db, command.operationId, 'hire_employee', createdAt, async () => {
    const employees = await loadEmployees(db)
    const employee = employees.find((row) => row.id === command.employeeId)
    if (!employee) throw new Error('직원을 찾을 수 없습니다.')
    const next = applyHire(employee, command)
    return [
      {
        sql: 'update employees set hired_at = ?, title = ?, badge_name = ? where id = ?',
        params: [next.hiredAt, next.title ?? null, next.badgeName ?? next.name, command.employeeId],
      },
      {
        sql: 'insert into employment_events(id, employee_id, kind, occurred_at, detail_json, created_at) values(?, ?, ?, ?, ?, ?)',
        params: [
          command.operationId,
          command.employeeId,
          'hire',
          command.hiredAt,
          JSON.stringify({ title: next.title, badgeName: next.badgeName }),
          createdAt,
        ],
      },
    ]
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
    const [employees, assets] = await Promise.all([loadEmployees(db), loadAssets(db)])
    const employee = employees.find((row) => row.id === command.employeeId)
    if (!employee) throw new Error('직원을 찾을 수 없습니다.')
    const next = applyLeave(employee, assets, command.leftAt)
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
