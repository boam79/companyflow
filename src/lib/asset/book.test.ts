import { describe, expect, it } from 'vitest'
import { applyStockCommand, companyOnHand, createStockState, onHand } from '../stock/engine'
import { applyAssignAsset, applyReturnAsset, assetClosedCaption, assetIdsForConvert, assetListCsv, assetNumber, assetStatusLabel, assetsFromConvert, filterAssets } from './book'

const ITEM = 'item-paper'
const MAIN = 'wh-main'

describe('재고 자산화', () => {
  it('2개를 자산화하면 현재고는 줄고 자산 수는 2다', () => {
    let state = createStockState()
    state = applyStockCommand(state, {
      type: 'post_direct_in',
      operationId: 'op-in',
      itemId: ITEM,
      warehouseId: MAIN,
      qty: 7,
    }).state
    state = applyStockCommand(state, {
      type: 'convert_to_asset',
      operationId: 'op-asset',
      itemId: ITEM,
      warehouseId: MAIN,
      qty: 2,
    }).state
    expect(onHand(state, ITEM, MAIN)).toBe(5)
    expect(companyOnHand(state, ITEM)).toBe(5)
    expect(assetIdsForConvert('op-asset', 2)).toEqual(['op-asset:1', 'op-asset:2'])
    expect(assetNumber('c269b67f-c44f-4015-9e3a-86af05a45077:1')).toBe('AST-C269B67F-1')
    expect(assetNumber('sample:desk-1', 'DSK-001')).toBe('AST-DSK-001')
    expect(assetNumber('guest:desk-1', 'DEMO-DSK-01')).toBe('AST-DEMO-DSK-01')
    expect(assetNumber('sample:chair-1')).toBe('AST-CHAIR-1')
    expect(assetsFromConvert('op-asset', ITEM, MAIN, 2, 't').map((row) => row.status)).toEqual([
      'in_storage',
      'in_storage',
    ])
    const converted = assetsFromConvert('op-asset', ITEM, MAIN, 2, 't')
    expect(converted[0].qrToken).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    )
    expect(converted[1].qrToken).not.toBe(converted[0].qrToken)
    expect(assetStatusLabel('in_storage')).toBe('사용')
    expect(assetStatusLabel('returned')).toBe('반품')
    expect(
      assetListCsv(
        [
          {
            id: 'guest:desk-1',
            itemId: 'item-desk',
            warehouseId: MAIN,
            status: 'in_storage',
            sourceOperationId: 'guest:desk-1',
            model: '견본 책상',
            serialNo: 'DEMO-DSK-01',
            locationText: '샘플 1층 로비',
            departmentName: '샘플총무',
            ownerName: '견본 김대리',
            acquiredAt: '2026-08-01',
            sourceOrderId: 'ORD-DEMO-01',
          },
        ],
        [{ id: 'item-desk', name: '샘플 책상' }],
        [{ id: MAIN, name: '샘플창고' }],
      ),
    ).toContain('AST-DEMO-DSK-01,샘플 책상,견본 책상,DEMO-DSK-01,샘플 1층 로비,샘플창고,샘플총무,견본 김대리,ORD-DEMO-01,2026-08-01,사용')
    expect(
      assetListCsv(
        [
          {
            id: 'guest:desk-1',
            itemId: 'item-desk',
            warehouseId: MAIN,
            status: 'in_storage',
            sourceOperationId: 'guest:desk-1',
            serialNo: 'DEMO-DSK-01',
          },
        ],
        [{ id: 'item-desk', name: '샘플 책상' }],
      ),
    ).not.toMatch(/단가|guest:desk|item-desk/)
    expect(
      filterAssets(
        [
          {
            id: 'guest:desk-1',
            itemId: 'item-desk',
            warehouseId: MAIN,
            status: 'in_storage',
            sourceOperationId: 'guest:desk-1',
            serialNo: 'DEMO-DSK-01',
            ownerName: '견본 김대리',
          },
          {
            id: 'guest:pc-1',
            itemId: 'item-computer',
            warehouseId: MAIN,
            status: 'in_storage',
            sourceOperationId: 'guest:pc-1',
            serialNo: 'DEMO-PC-01',
            ownerName: '데모 이사원',
          },
        ],
        'DEMO-DSK-01',
        [
          { id: 'item-desk', name: '샘플 책상' },
          { id: 'item-computer', name: '샘플 컴퓨터' },
        ],
      ).map((row) => row.serialNo),
    ).toEqual(['DEMO-DSK-01'])
    expect(
      assetClosedCaption(
        {
          id: 'guest:desk-1',
          itemId: 'item-desk',
          warehouseId: MAIN,
          status: 'returned',
          sourceOperationId: 'guest:desk-1',
          serialNo: 'DEMO-DSK-01',
          departmentName: '샘플총무',
          ownerName: '견본 김대리',
          acquiredAt: '2026-08-01',
        },
        [{ id: 'item-desk', name: '샘플 책상' }],
        [{ id: MAIN, name: '샘플창고' }],
      ),
    ).toBe('AST-DEMO-DSK-01 · 샘플 책상 · DEMO-DSK-01 · 샘플창고 · 샘플총무 · 견본 김대리 · 2026-08-01 · 반품')
  })

  it('보관 자산을 직원에게 배정하면 상태가 배정이 된다', () => {
    const assets = assetsFromConvert('op-asset', ITEM, MAIN, 1, 't')
    const assigned = applyAssignAsset(assets, { assetId: 'op-asset:1', employeeId: 'emp-1' })
    expect(assigned[0]).toMatchObject({ status: 'assigned', employeeId: 'emp-1' })
    expect(() => applyAssignAsset(assigned, { assetId: 'op-asset:1', employeeId: 'emp-2' })).toThrow(
      /이미 배정/,
    )
  })

  it('배정 자산을 회수하면 다시 보관이 된다', () => {
    const assets = applyAssignAsset(assetsFromConvert('op-asset', ITEM, MAIN, 1, 't'), {
      assetId: 'op-asset:1',
      employeeId: 'emp-1',
    })
    const returned = applyReturnAsset(assets, { assetId: 'op-asset:1' })
    expect(returned[0]).toMatchObject({ status: 'in_storage', employeeId: undefined })
  })

  it('퇴사한 직원에게는 배정할 수 없다', () => {
    const assets = assetsFromConvert('op-asset', ITEM, MAIN, 1, 't')
    expect(() =>
      applyAssignAsset(
        assets,
        { assetId: 'op-asset:1', employeeId: 'emp-1' },
        { leftAt: '2026-09-17' },
      ),
    ).toThrow(/퇴사/)
  })
})
