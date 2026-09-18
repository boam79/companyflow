import { describe, expect, it } from 'vitest'
import { applyHire, applyLeave, badgeLines, employeeHireDraft } from './employment'
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
})
