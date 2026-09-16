import { describe, expect, it } from 'vitest'
import { applyAssignAsset, assetsFromConvert } from './book'
import { ISSUE_ITEMS, PAPER_ITEM } from '../master/book'
import { suggestNextAssign, suggestNextAssetAction, suggestNextReturn } from './nextAssign'

const EMPLOYEES = [{ id: 'emp-kim', name: '김담당' }]
const ITEMS = [PAPER_ITEM, ...ISSUE_ITEMS]

describe('다음 자산 배정', () => {
  it('입사하면 회사 재고가 아니라 명찰부터 지급한다', () => {
    const paper = assetsFromConvert('op-paper', PAPER_ITEM.id, 'wh-main', 3, 't')
    expect(suggestNextAssign(paper, EMPLOYEES, ITEMS)).toBeNull()
    expect(suggestNextAssetAction(paper, EMPLOYEES, ITEMS)).toMatchObject({
      kind: 'issue',
      itemId: 'item-badge',
      itemName: '명찰',
      employeeName: '김담당',
    })
  })

  it('명찰을 지급한 뒤에는 유니폼을 지급한다', () => {
    const assets = applyAssignAsset(
      assetsFromConvert('op-badge', 'item-badge', 'wh-main', 1, 't'),
      { assetId: 'op-badge:1', employeeId: 'emp-kim' },
    )
    expect(suggestNextAssetAction(assets, EMPLOYEES, ITEMS)).toMatchObject({
      kind: 'issue',
      itemId: 'item-uniform',
      itemName: '유니폼',
    })
  })

  it('명찰·유니폼·노트북을 모두 지급하면 회수를 제안한다', () => {
    const assets = [
      ...applyAssignAsset(assetsFromConvert('op-badge', 'item-badge', 'wh-main', 1, 't'), {
        assetId: 'op-badge:1',
        employeeId: 'emp-kim',
      }),
      ...applyAssignAsset(assetsFromConvert('op-uniform', 'item-uniform', 'wh-main', 1, 't'), {
        assetId: 'op-uniform:1',
        employeeId: 'emp-kim',
      }),
      ...applyAssignAsset(assetsFromConvert('op-laptop', 'item-laptop', 'wh-main', 1, 't'), {
        assetId: 'op-laptop:1',
        employeeId: 'emp-kim',
      }),
    ]
    expect(suggestNextReturn(assets, ITEMS)).toMatchObject({ assetId: 'op-badge:1', employeeId: 'emp-kim' })
    expect(suggestNextAssetAction(assets, EMPLOYEES, ITEMS)).toMatchObject({
      kind: 'return',
      held: 3,
    })
  })

  it('보관 중인 명찰이 있으면 새로 만들지 않고 배정한다', () => {
    const assets = assetsFromConvert('op-badge', 'item-badge', 'wh-main', 1, 't')
    expect(suggestNextAssetAction(assets, EMPLOYEES, ITEMS)).toMatchObject({
      kind: 'assign',
      assetId: 'op-badge:1',
      itemName: '명찰',
    })
  })
})
