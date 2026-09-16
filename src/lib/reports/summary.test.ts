import { describe, expect, it } from 'vitest'
import { applyAssignAsset, assetsFromConvert } from '../asset/book'
import { applyStockCommand, createStockState } from '../stock/engine'
import { csvFromSummary, inInclusiveRange, summarizeStock } from './summary'

const ITEM = 'item-paper'
const MAIN = 'wh-main'
const RANGE = { from: '2026-09-01', to: '2026-09-17' }

describe('통계 요약', () => {
  it('시작일과 종료일을 포함한다', () => {
    expect(inInclusiveRange('2026-09-01T00:00:00.000Z', RANGE)).toBe(true)
    expect(inInclusiveRange('2026-09-17T23:59:59.000Z', RANGE)).toBe(true)
    expect(inInclusiveRange('2026-09-18T00:00:00.000Z', RANGE)).toBe(false)
  })

  it('수령·반출·자산화와 자산 수가 같은 원본에서 나온다', () => {
    let state = createStockState()
    state = applyStockCommand(state, {
      type: 'post_direct_in',
      operationId: 'op-in',
      itemId: ITEM,
      warehouseId: MAIN,
      qty: 7,
    }).state
    state = applyStockCommand(state, {
      type: 'post_issue',
      operationId: 'op-out',
      itemId: ITEM,
      warehouseId: MAIN,
      qty: 2,
      personName: '김담당',
    }).state
    state = applyStockCommand(state, {
      type: 'convert_to_asset',
      operationId: 'op-asset',
      itemId: ITEM,
      warehouseId: MAIN,
      qty: 1,
    }).state
    const ledger = state.ledger.map((line) => ({ ...line, createdAt: '2026-09-17T01:00:00.000Z' }))
    const withDates = { ...state, ledger }
    const assets = applyAssignAsset(assetsFromConvert('op-asset', ITEM, MAIN, 1, 't'), {
      assetId: 'op-asset:1',
      employeeId: 'emp-1',
    })
    const summary = summarizeStock(withDates, assets, ITEM, RANGE)
    expect(summary).toMatchObject({
      receipt: 7,
      issue: 2,
      convert: 1,
      onHand: 4,
      assets: 1,
      assigned: 1,
    })
    expect(csvFromSummary('복사용지', summary, RANGE)).toContain('복사용지,2026-09-01,2026-09-17,7,2,1,4,1,1')
  })
})
