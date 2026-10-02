import { describe, expect, it } from 'vitest'
import {
  assetProfileSavedNotice,
  assetProfileStatements,
  readAssetProfile,
} from './profile'

describe('자산 정보', () => {
  it('모델·일련번호·자리·취득일을 저장하고 직원 배정은 두지 않는다', () => {
    const profile = readAssetProfile({
      model: '  견본 책상  ',
      serialNo: 'DSK-9',
      locationText: '샘플 3층',
      departmentName: '샘플총무',
      ownerName: '견본 김대리',
      acquiredAt: '2026-10-03',
    })
    expect(profile).toEqual({
      model: '견본 책상',
      serialNo: 'DSK-9',
      locationText: '샘플 3층',
      departmentName: '샘플총무',
      ownerName: '견본 김대리',
      acquiredAt: '2026-10-03',
    })
    expect(assetProfileStatements('op-desk:1', profile)).toEqual([
      {
        sql: 'update assets set model = ?, serial_no = ?, location_text = ?, department_name = ?, owner_name = ?, acquired_at = ? where id = ?',
        params: ['견본 책상', 'DSK-9', '샘플 3층', '샘플총무', '견본 김대리', '2026-10-03', 'op-desk:1'],
      },
    ])
    expect(assetProfileSavedNotice()).toContain('자산 정보를 저장했습니다')
    expect(assetProfileSavedNotice()).not.toMatch(/배정했습니다/)
  })

  it('빈 칸과 잘못된 취득일은 막는다', () => {
    expect(readAssetProfile({}).acquiredAt).toBe('')
    expect(() => readAssetProfile({ acquiredAt: '10/03' })).toThrow(/날짜/)
    expect(() => assetProfileStatements('', readAssetProfile({}))).toThrow(/자산/)
  })
})
