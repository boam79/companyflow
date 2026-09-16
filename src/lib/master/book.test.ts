import { describe, expect, it } from 'vitest'
import { CompanyMasterBook, seedDefaultMaster } from './book'

describe('회사별 기준정보 격리', () => {
  it('A회사 필드 라벨을 바꿔도 B회사는 유지된다', () => {
    const a = new CompanyMasterBook('aaa')
    const b = new CompanyMasterBook('bbb')
    seedDefaultMaster(a)
    seedDefaultMaster(b)

    a.defineField('op-a-1', {
      entity: 'employee',
      key: 'employee_no',
      label: '명찰번호',
    })
    b.defineField('op-b-1', {
      entity: 'employee',
      key: 'employee_no',
      label: '사원번호',
    })

    expect(a.fieldLabel('employee', 'employee_no')).toBe('명찰번호')
    expect(b.fieldLabel('employee', 'employee_no')).toBe('사원번호')
    expect(a.companyId).not.toBe(b.companyId)
  })

  it('기본 시드는 반출·배정에 쓰는 김담당을 만든다', () => {
    const book = new CompanyMasterBook('hq')
    seedDefaultMaster(book)
    expect(book.employees.get('emp-kim')).toEqual({ id: 'emp-kim', name: '김담당' })
    expect(book.departments.get('dept-admin')?.name).toBe('총무')
  })

  it('같은 operation_id 는 부서를 한 번만 만든다', () => {
    const book = new CompanyMasterBook('aaa')
    const first = book.upsertDepartment('op-dept', { id: 'd1', name: '총무' })
    const second = book.upsertDepartment('op-dept', { id: 'd1', name: '경영지원' })
    expect(first.status).toBe('applied')
    expect(second.status).toBe('duplicate')
    expect(book.departments.get('d1')?.name).toBe('총무')
  })
})
