import { describe, expect, it } from 'vitest'
import {
  applyHire,
  applyLeave,
  badgeLines,
  defaultRosterTab,
  employeeHireDraft,
  employeeRosterPhase,
  executeHire,
  groupRoster,
  hireProcessSteps,
  hireProcessSummary,
  rosterCaption,
  rosterPhase,
  visiblePeoplePanels,
} from './employment'
import { applyIssueCheck, assertOffboardingClear, onboardingView } from './onboarding'

describe('입퇴사', () => {
  it('입사하면 명찰 이름과 입사일이 생긴다', () => {
    const hired = applyHire(
      { id: 'emp-1', name: '김담당' },
      { hiredAt: '2026-03-01', title: '주임', badgeName: '김 담당', department: '마케팅팀' },
    )
    expect(hired).toMatchObject({
      hiredAt: '2026-03-01',
      title: '주임',
      badgeName: '김 담당',
      badgeDepartment: '마케팅팀',
    })
    expect(badgeLines(hired, hired.badgeDepartment)).toEqual(['김 담당', '마케팅팀', '주임'])
  })

  it('회사 재고는 퇴사 프로세스가 아니다', () => {
    const employee = applyHire({ id: 'emp-1', name: '김담당' }, { hiredAt: '2026-03-01' })
    expect(applyLeave(employee, '2026-09-17').leftAt).toBe('2026-09-17')
  })

  it('입사 지급이 남아 있으면 퇴사 프로세스가 막힌다', () => {
    const checks = applyIssueCheck(onboardingView('emp-1', []), 'laptop', '2026-09-17')
    expect(() => assertOffboardingClear(checks)).toThrow(/노트북 회수/)
  })

  it('입사 칸은 부서 이름과 퇴사자 오늘 날짜를 채운다', () => {
    const depts = [{ id: 'dept-admin', name: '총무' }]
    expect(
      employeeHireDraft(
        { id: 'emp-kim', name: '김담당', departmentId: 'dept-admin', title: '주임', hiredAt: '2026-09-18' },
        depts,
        '2026-09-19',
      ),
    ).toMatchObject({ department: '총무', hiredAt: '2026-09-18', badgeName: '김담당' })
    expect(
      employeeHireDraft(
        {
          id: 'emp-oh',
          name: '오세훈',
          hiredAt: '2022-06-01',
          leftAt: '2026-08-31',
          badgeDepartment: '영업',
        },
        depts,
        '2026-09-19',
      ),
    ).toMatchObject({ hiredAt: '2026-09-19', department: '영업' })
  })

  it('퇴사자는 삭제하지 않고 같은 직원으로 재입사한다', () => {
    const left = applyLeave(
      applyHire({ id: 'emp-1', name: '김담당' }, { hiredAt: '2026-03-01' }),
      '2026-09-17',
    )
    const hired = applyHire(left, { hiredAt: '2026-09-17', title: '주임' })
    expect(hired).toMatchObject({ hiredAt: '2026-09-17', leftAt: undefined, title: '주임' })
  })

  it('직원 목록은 입사 중·재직·퇴사로 나눈다', () => {
    const joining = { id: 'emp-kim', name: '김담당', hiredAt: '2026-09-16' }
    const employed = { id: 'emp-lee', name: '이수진', hiredAt: '2025-07-14' }
    const left = { id: 'emp-oh', name: '오세훈', hiredAt: '2022-06-01', leftAt: '2026-08-31' }
    const before = { id: 'emp-new', name: '신입' }
    const checks = [
      { employeeId: 'emp-lee', itemKey: 'badge' as const, issued: true },
      { employeeId: 'emp-lee', itemKey: 'uniform' as const, issued: true },
      { employeeId: 'emp-lee', itemKey: 'laptop' as const, issued: true },
      { employeeId: 'emp-kim', itemKey: 'laptop' as const, issued: true },
    ]
    expect(
      groupRoster([joining, employed, left, before], checks).map((group) => [
        group.phase,
        group.label,
        group.employees.map((row) => row.name),
      ]),
    ).toEqual([
      ['joining', '입사 중', ['김담당', '신입']],
      ['employed', '재직', ['이수진']],
      ['left', '퇴사', ['오세훈']],
    ])
    expect(rosterCaption(joining, onboardingView('emp-kim', checks))).toBe('입사 중 · 1/3 지급')
    expect(rosterCaption(before, onboardingView('emp-new', []))).toBe('입사 전 · 0/3 지급')
    expect(rosterCaption(employed, onboardingView('emp-lee', checks))).toBe('재직 · 2025-07-14')
    expect(rosterCaption(left, onboardingView('emp-oh', []))).toBe('퇴사 2026-08-31')
    expect(visiblePeoplePanels('joining')).toEqual({ hire: true, documents: true, leave: false })
    expect(visiblePeoplePanels('employed')).toEqual({ hire: false, documents: false, leave: true })
    expect(visiblePeoplePanels('left')).toEqual({ hire: false, documents: false, leave: true })
  })

  it('입사 중 프로세스는 입사 저장과 지급 3칸이다', () => {
    const employee = { id: 'emp-1', name: '김담당', hiredAt: '2026-09-16' }
    const checks = applyIssueCheck(onboardingView('emp-1', []), 'laptop', '2026-09-16')
    expect(hireProcessSteps(employee, checks).map((step) => [step.label, step.done])).toEqual([
      ['입사 저장', true],
      ['명찰 지급', false],
      ['유니폼 지급', false],
      ['노트북 지급', true],
    ])
    expect(rosterPhase(employee, checks)).toBe('joining')
    expect(hireProcessSummary(employee, checks)).toBe('입사 중 · 2/4')
    const complete = applyIssueCheck(applyIssueCheck(checks, 'badge', '2026-09-16'), 'uniform', '2026-09-16')
    expect(rosterPhase(employee, complete)).toBe('employed')
    expect(hireProcessSummary(employee, complete)).toBe('입사 완료 · 3/3 지급')
    expect(hireProcessSummary({ id: 'emp-new', name: '신입' }, onboardingView('emp-new', []))).toBe('입사 중 · 0/4')
  })

  it('기본 탭은 사람이 있는 첫 그룹이고 직원 탭은 상태를 따른다', () => {
    const joining = { id: 'emp-kim', name: '김담당', hiredAt: '2026-09-16' }
    const employed = { id: 'emp-lee', name: '이수진', hiredAt: '2025-07-14' }
    const left = { id: 'emp-oh', name: '오세훈', hiredAt: '2022-06-01', leftAt: '2026-08-31' }
    const checks = [
      { employeeId: 'emp-lee', itemKey: 'badge' as const, issued: true },
      { employeeId: 'emp-lee', itemKey: 'uniform' as const, issued: true },
      { employeeId: 'emp-lee', itemKey: 'laptop' as const, issued: true },
    ]
    const groups = groupRoster([joining, employed, left], checks)
    expect(defaultRosterTab(groups)).toBe('joining')
    expect(defaultRosterTab(groups.map((group) => (group.phase === 'joining' ? { ...group, employees: [] } : group)))).toBe(
      'employed',
    )
    expect(employeeRosterPhase('emp-oh', [joining, employed, left], checks)).toBe('left')
    expect(employeeRosterPhase('emp-lee', [joining, employed, left], checks)).toBe('employed')
  })

  it('이미 재직 중이면 입사 저장은 정보를 고치고 이력을 다시 넣지 않는다', async () => {
    const employee = {
      id: 'emp-kim',
      name: '김담당',
      hired_at: '2026-09-16',
      left_at: null as string | null,
      title: '주임',
      badge_name: '김담당',
      badge_department: '총무',
    }
    const statements: { sql: string }[] = []
    const processed = new Set<string>()
    const db = {
      query: async <T>(sql: string) => {
        if (sql.includes('from processed_operations')) {
          return (processed.size ? [{ operation_id: 'op-save' }] : []) as T[]
        }
        if (sql.includes('from employees')) {
          return [employee] as T[]
        }
        return [] as T[]
      },
      batch: async (next: { sql: string }[]) => {
        statements.push(...next)
        processed.add('op-save')
      },
    }
    const first = await executeHire(db, {
      operationId: 'op-save',
      employeeId: 'emp-kim',
      hiredAt: '2026-09-16',
      title: '대리',
      badgeName: '김담당',
      department: '총무',
    })
    expect(first.status).toBe('applied')
    expect(statements.some((row) => row.sql.includes('insert into employment_events'))).toBe(false)
    expect(statements.some((row) => row.sql.includes('update employees'))).toBe(true)
  })
})
