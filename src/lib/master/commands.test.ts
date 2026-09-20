import { describe, expect, it } from 'vitest'
import {
  MASTER_TABLES,
  assertMasterTable,
  fieldEntityFromTable,
  masterInsertStatement,
  minStockUpdateStatement,
  itemCatalogUpdateStatement,
  assertUniqueItemName,
  assertUniqueItemCode,
  purchaseKindLabel,
  assertPurchaseKind,
} from './commands'

describe('기준정보 SQL 명령', () => {
  it('허용된 테이블만 insert 한다', () => {
    for (const table of MASTER_TABLES) {
      const stmt = masterInsertStatement(table, {
        id: 'id-1',
        name: '총무',
        createdAt: '2026-09-16T00:00:00.000Z',
      })
      expect(stmt.sql.startsWith(`insert into ${table}`)).toBe(true)
      if (table === 'employees') {
        expect(stmt.params).toEqual(['id-1', '총무', null, '2026-09-16T00:00:00.000Z'])
      } else if (table === 'items') {
        expect(stmt.params).toEqual(['id-1', '총무', null, '개', 0, 'supply', '2026-09-16T00:00:00.000Z'])
      } else {
        expect(stmt.params).toEqual(['id-1', '총무', '2026-09-16T00:00:00.000Z'])
      }
    }
    expect(() => assertMasterTable('processed_operations')).toThrow(/허용되지 않은/)
  })

  it('품목 최소재고를 고친다', () => {
    expect(minStockUpdateStatement('item-paper', 10)).toEqual({
      sql: 'update items set min_stock = ? where id = ?',
      params: [10, 'item-paper'],
    })
    expect(() => minStockUpdateStatement('item-paper', -1)).toThrow(/최소재고/)
    expect(() => minStockUpdateStatement('item-paper', 1.5)).toThrow(/최소재고/)
  })

  it('품목 코드·단위·최소재고를 함께 고친다', () => {
    expect(
      itemCatalogUpdateStatement({
        id: 'item-paper',
        name: ' 복사용지 ',
        code: ' PAPER ',
        unit: ' 박스 ',
        minStock: 10,
        purchaseKind: 'material',
      }),
    ).toEqual({
      sql: 'update items set name = ?, code = ?, unit = ?, min_stock = ?, purchase_kind = ? where id = ?',
      params: ['복사용지', 'PAPER', '박스', 10, 'material', 'item-paper'],
    })
    expect(
      itemCatalogUpdateStatement({
        id: 'item-clip',
        name: '클립',
        code: '  ',
        unit: '개',
        minStock: 0,
      }).params,
    ).toEqual(['클립', null, '개', 0, 'supply', 'item-clip'])
    expect(() =>
      itemCatalogUpdateStatement({ id: 'item-paper', name: '복사용지', code: 'PAPER', unit: '', minStock: 0 }),
    ).toThrow(/단위/)
  })

  it('같은 품목 이름·코드는 막는다', () => {
    const rows = [
      { id: 'item-paper', name: '복사용지', code: 'PAPER' },
      { id: 'item-clip', name: '클립', code: null },
    ]
    expect(() => assertUniqueItemName(' 복사용지 ', rows)).toThrow(/같은 이름/)
    expect(() => assertUniqueItemName('복사용지', rows, 'item-paper')).not.toThrow()
    expect(() => assertUniqueItemCode('paper', rows)).toThrow(/같은 코드/)
    expect(() => assertUniqueItemCode('', rows)).not.toThrow()
  })

  it('구매 구분은 일반 비품·자재·서비스다', () => {
    expect(purchaseKindLabel('supply')).toBe('일반 비품')
    expect(purchaseKindLabel('material')).toBe('자재')
    expect(purchaseKindLabel('service')).toBe('서비스')
    expect(() => assertPurchaseKind('asset')).toThrow(/구매 구분/)
  })

  it('직원 화면의 기본 추가 필드는 employee 엔티티다', () => {
    expect(fieldEntityFromTable('employees')).toBe('employee')
    expect(fieldEntityFromTable('items')).toBe('item')
  })
})
