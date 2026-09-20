import { describe, expect, it } from 'vitest'
import {
  MASTER_TABLES,
  assertMasterTable,
  fieldEntityFromTable,
  masterInsertStatement,
  minStockUpdateStatement,
  itemCatalogUpdateStatement,
  partnerUpdateStatement,
  partnerAttachment,
  assertUniqueItemName,
  assertUniqueItemCode,
  assertUniquePartnerName,
  purchaseKindLabel,
  assertPurchaseKind,
  duplicateItemRepairs,
  assertItemSupplier,
  masterDeactivateStatement,
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
        expect(stmt.params).toEqual(['id-1', '총무', null, '개', 0, 'supply', null, '2026-09-16T00:00:00.000Z'])
      } else if (table === 'partners') {
        expect(stmt.params).toEqual([
          'id-1',
          '총무',
          null,
          null,
          null,
          null,
          null,
          '2026-09-16T00:00:00.000Z',
        ])
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
      sql: 'update items set name = ?, code = ?, unit = ?, min_stock = ?, purchase_kind = ?, partner_id = ? where id = ?',
      params: ['복사용지', 'PAPER', '박스', 10, 'material', null, 'item-paper'],
    })
    expect(
      itemCatalogUpdateStatement({
        id: 'item-paper',
        name: '복사용지',
        code: 'PAPER',
        unit: '개',
        minStock: 4,
        partnerId: 'partner-mfp',
      }).params,
    ).toEqual(['복사용지', 'PAPER', '개', 4, 'supply', 'partner-mfp', 'item-paper'])
    expect(
      itemCatalogUpdateStatement({
        id: 'item-clip',
        name: '클립',
        code: '  ',
        unit: '개',
        minStock: 0,
      }).params,
    ).toEqual(['클립', null, '개', 0, 'supply', null, 'item-clip'])
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
    expect(() => assertItemSupplier('partner-mfp', [{ id: 'partner-mfp' }])).not.toThrow()
    expect(() => assertItemSupplier('', [{ id: 'partner-mfp' }])).not.toThrow()
    expect(() => assertItemSupplier('missing', [{ id: 'partner-mfp' }])).toThrow(/공급사/)
  })

  it('구매 구분은 일반 비품·자재·서비스다', () => {
    expect(purchaseKindLabel('supply')).toBe('일반 비품')
    expect(purchaseKindLabel('material')).toBe('자재')
    expect(purchaseKindLabel('service')).toBe('서비스')
    expect(() => assertPurchaseKind('asset')).toThrow(/구매 구분/)
  })

  it('같은 이름 품목은 코드 있는 줄만 남긴다', () => {
    expect(
      duplicateItemRepairs([
        { id: 'item-paper', name: '복사용지', code: 'PAPER', minStock: 0 },
        { id: 'item-dup', name: '복사용지', code: null, minStock: 4 },
        { id: 'item-note', name: '포스트잇', minStock: 0 },
      ]),
    ).toEqual({
      deactivateIds: ['item-dup'],
      minStockUpdates: [{ id: 'item-paper', minStock: 4 }],
    })
  })

  it('거래처는 이름·연락처·메모·첨부를 함께 둔다', () => {
    expect(
      masterInsertStatement('partners', {
        id: 'partner-lease',
        name: ' 한국임대 ',
        createdAt: '2026-09-20T00:00:00.000Z',
        phone: ' 02-3456-1000 ',
        memo: ' 본사 3층 임대 ',
        fileName: '명함.png',
        fileMime: 'image/png',
        fileBase64: 'abc',
      }).params,
    ).toEqual([
      'partner-lease',
      '한국임대',
      '02-3456-1000',
      '본사 3층 임대',
      '명함.png',
      'image/png',
      'abc',
      '2026-09-20T00:00:00.000Z',
    ])
    expect(
      partnerUpdateStatement({
        id: 'partner-lease',
        name: '한국임대',
        phone: '02-3456-1000',
        memo: '본사 3층 임대',
      }),
    ).toEqual({
      sql: 'update partners set name = ?, phone = ?, memo = ? where id = ?',
      params: ['한국임대', '02-3456-1000', '본사 3층 임대', 'partner-lease'],
    })
    expect(
      partnerUpdateStatement({
        id: 'partner-lease',
        name: '한국임대',
        phone: '',
        memo: '',
        fileName: '명함.png',
        fileMime: 'image/png',
        fileBase64: 'abc',
      }).params,
    ).toEqual(['한국임대', null, null, '명함.png', 'image/png', 'abc', 'partner-lease'])
    const rows = [{ id: 'partner-lease', name: '한국임대' }]
    expect(() => assertUniquePartnerName(' 한국임대 ', rows)).toThrow(/같은 이름/)
    expect(() => assertUniquePartnerName('한국임대', rows, 'partner-lease')).not.toThrow()
    const png = partnerAttachment({
      name: '명함.png',
      mime: 'image/png',
      bytes: new Uint8Array([1, 2, 3]),
    })
    expect(png.fileName).toBe('명함.png')
    expect(png.fileMime).toBe('image/png')
    expect(png.fileBase64.length).toBeGreaterThan(0)
    expect(() =>
      partnerAttachment({ name: '명함.txt', mime: 'text/plain', bytes: new Uint8Array([1]) }),
    ).toThrow(/PDF·PNG·JPEG/)
  })

  it('품목·부서·거래처·창고는 삭제 대신 사용 안 함으로 숨긴다', () => {
    expect(masterDeactivateStatement('items', 'item-clip')).toEqual({
      sql: 'update items set active = 0 where id = ?',
      params: ['item-clip'],
    })
    expect(masterDeactivateStatement('departments', 'dept-dev')).toEqual({
      sql: 'update departments set active = 0 where id = ?',
      params: ['dept-dev'],
    })
    expect(masterDeactivateStatement('partners', 'partner-kt').sql).toContain('partners')
    expect(masterDeactivateStatement('warehouses', 'wh-sub').sql).toContain('warehouses')
    expect(() => masterDeactivateStatement('employees', 'emp-kim')).toThrow(/퇴사/)
    expect(() => masterDeactivateStatement('items', '')).toThrow(/고르세요/)
  })

  it('직원 화면의 기본 추가 필드는 employee 엔티티다', () => {
    expect(fieldEntityFromTable('employees')).toBe('employee')
    expect(fieldEntityFromTable('items')).toBe('item')
  })
})
