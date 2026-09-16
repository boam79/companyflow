import { describe, expect, it } from 'vitest'
import {
  MASTER_TABLES,
  assertMasterTable,
  fieldEntityFromTable,
  masterInsertStatement,
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
      } else {
        expect(stmt.params).toEqual(['id-1', '총무', '2026-09-16T00:00:00.000Z'])
      }
    }
    expect(() => assertMasterTable('processed_operations')).toThrow(/허용되지 않은/)
  })

  it('직원 화면의 기본 추가 필드는 employee 엔티티다', () => {
    expect(fieldEntityFromTable('employees')).toBe('employee')
    expect(fieldEntityFromTable('items')).toBe('item')
  })
})
