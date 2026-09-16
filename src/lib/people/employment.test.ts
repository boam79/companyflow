import { describe, expect, it } from 'vitest'
import { applyAssignAsset, assetsFromConvert } from '../asset/book'
import { applyHire, applyLeave, badgeLines } from './employment'

const ITEM = 'item-paper'
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

  it('배정 자산이 있으면 퇴사할 수 없다', () => {
    const employee = applyHire({ id: 'emp-1', name: '김담당' }, { hiredAt: '2026-03-01' })
    const assets = applyAssignAsset(assetsFromConvert('op-asset', ITEM, MAIN, 1, 't'), {
      assetId: 'op-asset:1',
      employeeId: 'emp-1',
    })
    expect(() => applyLeave(employee, assets, '2026-09-17')).toThrow(/미회수/)
  })

  it('회수 뒤에는 퇴사할 수 있다', () => {
    const employee = applyHire({ id: 'emp-1', name: '김담당' }, { hiredAt: '2026-03-01' })
    const left = applyLeave(employee, [], '2026-09-17')
    expect(left.leftAt).toBe('2026-09-17')
  })
})
