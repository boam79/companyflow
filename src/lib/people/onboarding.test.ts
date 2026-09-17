import { describe, expect, it } from 'vitest'
import {
  applyIssueCheck,
  applyReturnCheck,
  assertOffboardingClear,
  isProcessItemId,
  leavePhase,
  leaveSummary,
  migrateProcessAssetsToChecks,
  onboardingView,
  outstandingOnboarding,
} from './onboarding'

describe('입퇴사 프로세스', () => {
  it('입사 프로세스는 명찰·유니폼·노트북을 자산 없이 체크한다', () => {
    const empty = onboardingView('emp-1', [])
    expect(empty.map((row) => row.hireLabel)).toEqual(['명찰 지급', '유니폼 지급', '노트북 지급'])
    expect(empty.every((row) => !row.issued)).toBe(true)
    const issued = applyIssueCheck(empty, 'badge', '2026-09-17')
    expect(outstandingOnboarding(issued)).toHaveLength(1)
    expect(issued.find((row) => row.key === 'badge')?.issued).toBe(true)
  })

  it('퇴사는 지급 중인 입사 항목이 있으면 막힌다', () => {
    const issued = applyIssueCheck(onboardingView('emp-1', []), 'laptop', '2026-09-17')
    expect(() => assertOffboardingClear(issued)).toThrow(/노트북 회수/)
    expect(() => assertOffboardingClear(issued)).toThrow(/먼저 하세요/)
    expect(() => assertOffboardingClear(issued)).not.toThrow(/명찰 회수/)
  })

  it('퇴사 프로세스에서 회수하면 퇴사할 수 있다', () => {
    let checks = applyIssueCheck(onboardingView('emp-1', []), 'uniform', '2026-09-17')
    checks = applyReturnCheck(checks, 'uniform', '2026-09-17')
    expect(() => assertOffboardingClear(checks)).not.toThrow()
    expect(outstandingOnboarding(checks)).toHaveLength(0)
  })

  it('재직 중에는 이전 회수를 퇴사 완료로 보여 주지 않는다', () => {
    const returned = applyReturnCheck(
      applyIssueCheck(onboardingView('emp-1', []), 'badge', '2026-09-17'),
      'badge',
      '2026-09-17',
    )
    expect(leavePhase(returned[0], false)).toBe('pending')
    expect(leavePhase(returned[0], true)).toBe('returned')
    expect(leaveSummary(onboardingView('emp-1', []), false)).toBe('지급 전 · 입사 프로세스부터')
    expect(leaveSummary(applyIssueCheck(onboardingView('emp-1', []), 'laptop', '2026-09-17'), false)).toBe(
      '미회수 1 · 퇴사 전 회수',
    )
  })

  it('명찰·유니폼·노트북은 회사 자산 품목이 아니다', () => {
    expect(isProcessItemId('item-badge')).toBe(true)
    expect(isProcessItemId('item-uniform')).toBe(true)
    expect(isProcessItemId('item-laptop')).toBe(true)
    expect(isProcessItemId('item-paper')).toBe(false)
  })

  it('배정된 프로세스 자산은 입사 체크로 옮기고 자산에서 지운다', async () => {
    const checks: unknown[][] = []
    const execs: string[] = []
    const db = {
      query: async <T>() =>
        [
          {
            id: 'a1',
            item_id: 'item-badge',
            status: 'assigned',
            employee_id: 'emp-1',
          },
          {
            id: 'a2',
            item_id: 'item-paper',
            status: 'assigned',
            employee_id: 'emp-1',
          },
        ] as T[],
      exec: async (sql: string, params?: unknown[]) => {
        execs.push(sql)
        if (params) checks.push(params)
      },
    }
    await migrateProcessAssetsToChecks(db)
    expect(checks[0]).toEqual(expect.arrayContaining(['emp-1', 'badge']))
    expect(execs.some((sql) => /delete from assets/i.test(sql))).toBe(true)
  })
})
