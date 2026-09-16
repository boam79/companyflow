import { describe, expect, it } from 'vitest'
import { applyAssignAsset, assetsFromConvert } from '../asset/book'
import { ISSUE_ITEMS, PAPER_ITEM } from '../master/book'
import { applyHire, applyLeave, badgeLines } from './employment'

const MAIN = 'wh-main'

describe('입퇴사', () => {
  it('입사하면 명찰 이름과 입사일이 생긴다', () => {
    const hired = applyHire(
      { id: 'emp-1', name: '김담당' },
      { hiredAt: '2026-03-01', title: '주임', badgeName: '김 담당' },
    )
    expect(hired).toMatchObject({ hiredAt: '2026-03-01', title: '주임', badgeName: '김 담당' })
    expect(badgeLines(hired, '총무')).toEqual(['김 담당', '총무', '주임'])
  })

  it('회사 재고(복사용지)는 퇴사 회수 대상이 아니다', () => {
    const employee = applyHire({ id: 'emp-1', name: '김담당' }, { hiredAt: '2026-03-01' })
    const assets = applyAssignAsset(assetsFromConvert('op-paper', PAPER_ITEM.id, MAIN, 3, 't'), {
      assetId: 'op-paper:1',
      employeeId: 'emp-1',
    })
    expect(applyLeave(employee, assets, '2026-09-17', [PAPER_ITEM, ...ISSUE_ITEMS]).leftAt).toBe(
      '2026-09-17',
    )
  })

  it('노트북 지급품이 있으면 퇴사할 수 없다', () => {
    const employee = applyHire({ id: 'emp-1', name: '김담당' }, { hiredAt: '2026-03-01' })
    const assets = applyAssignAsset(assetsFromConvert('op-laptop', 'item-laptop', MAIN, 1, 't'), {
      assetId: 'op-laptop:1',
      employeeId: 'emp-1',
    })
    expect(() => applyLeave(employee, assets, '2026-09-17', ISSUE_ITEMS)).toThrow(/지급품/)
  })

  it('회수 뒤에는 퇴사할 수 있다', () => {
    const employee = applyHire({ id: 'emp-1', name: '김담당' }, { hiredAt: '2026-03-01' })
    const left = applyLeave(employee, [], '2026-09-17', ISSUE_ITEMS)
    expect(left.leftAt).toBe('2026-09-17')
  })

  it('퇴사자는 삭제하지 않고 같은 직원으로 재입사한다', () => {
    const left = applyLeave(
      applyHire({ id: 'emp-1', name: '김담당' }, { hiredAt: '2026-03-01' }),
      [],
      '2026-09-17',
      ISSUE_ITEMS,
    )
    const hired = applyHire(left, { hiredAt: '2026-09-17', title: '주임' })
    expect(hired).toMatchObject({ hiredAt: '2026-09-17', leftAt: undefined, title: '주임' })
  })
})
