import { describe, expect, it } from 'vitest'
import { applyAssignAsset, assetsFromConvert } from './book'
import { suggestNextAssign, suggestNextAssetAction, suggestNextReturn } from './nextAssign'

const EMPLOYEES = [{ id: 'emp-kim', name: '김담당' }]

describe('다음 자산 배정', () => {
  it('보관 자산과 재직 직원이 있으면 배정 1을 제안한다', () => {
    const assets = assetsFromConvert('op-asset', 'item-paper', 'wh-main', 3, 't')
    expect(suggestNextAssign(assets, EMPLOYEES)).toMatchObject({
      assetId: 'op-asset:1',
      employeeId: 'emp-kim',
      employeeName: '김담당',
    })
    expect(suggestNextAssetAction(assets, EMPLOYEES)).toMatchObject({
      kind: 'assign',
      assetId: 'op-asset:1',
      stored: 3,
    })
  })

  it('미회수가 있으면 보관이 있어도 회수를 먼저 제안한다', () => {
    let assets = assetsFromConvert('op-asset', 'item-paper', 'wh-main', 3, 't')
    assets = applyAssignAsset(assets, { assetId: 'op-asset:1', employeeId: 'emp-kim' })
    assets = applyAssignAsset(assets, { assetId: 'op-asset:2', employeeId: 'emp-kim' })
    expect(suggestNextAssign(assets, EMPLOYEES)?.assetId).toBe('op-asset:3')
    expect(suggestNextAssetAction(assets, EMPLOYEES)).toMatchObject({
      kind: 'return',
      assetId: 'op-asset:1',
      employeeId: 'emp-kim',
      held: 2,
    })
  })

  it('모두 배정되면 다음 배정이 없고 회수 1을 제안한다', () => {
    const assets = applyAssignAsset(assetsFromConvert('op-asset', 'item-paper', 'wh-main', 1, 't'), {
      assetId: 'op-asset:1',
      employeeId: 'emp-kim',
    })
    expect(suggestNextAssign(assets, EMPLOYEES)).toBeNull()
    expect(suggestNextReturn(assets)).toEqual({ assetId: 'op-asset:1', employeeId: 'emp-kim' })
    expect(suggestNextAssetAction(assets, EMPLOYEES)).toMatchObject({
      kind: 'return',
      held: 1,
    })
  })
})
