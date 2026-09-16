import { describe, expect, it } from 'vitest'
import { applyAssignAsset, assetsFromConvert } from './book'
import { suggestNextAssign, suggestNextReturn } from './nextAssign'

describe('다음 자산 배정', () => {
  it('보관 자산과 재직 직원이 있으면 배정 1을 제안한다', () => {
    const assets = assetsFromConvert('op-asset', 'item-paper', 'wh-main', 3, 't')
    expect(
      suggestNextAssign(assets, [{ id: 'emp-kim', name: '김담당' }]),
    ).toMatchObject({
      assetId: 'op-asset:1',
      employeeId: 'emp-kim',
      employeeName: '김담당',
    })
  })

  it('모두 배정되면 다음 배정이 없고 회수 1을 제안한다', () => {
    const assets = applyAssignAsset(assetsFromConvert('op-asset', 'item-paper', 'wh-main', 1, 't'), {
      assetId: 'op-asset:1',
      employeeId: 'emp-kim',
    })
    expect(suggestNextAssign(assets, [{ id: 'emp-kim', name: '김담당' }])).toBeNull()
    expect(suggestNextReturn(assets)).toEqual({ assetId: 'op-asset:1' })
  })
})
