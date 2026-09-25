import { describe, expect, it } from 'vitest'
import { COMPANY_ASSET_ITEMS, writeDefaultMaster } from './book'
import {
  SAMPLE_ASSETS,
  SAMPLE_CONTRACTS,
  SAMPLE_EMPLOYEES,
  sampleAssetNames,
  sampleContractTitles,
  writeSampleCompanyData,
} from './sample'

describe('회사 샘플 데이터', () => {
  it('직원 여러 명과 가구·컴퓨터를 자산으로 넣는다', async () => {
    const statements: { sql: string; params?: unknown[] }[] = []
    await writeSampleCompanyData({
      exec: async (sql, params) => {
        statements.push({ sql, params })
      },
    })
    const names = statements.flatMap((row) => (row.params ?? []).filter((value) => typeof value === 'string'))
    expect(SAMPLE_EMPLOYEES.map((row) => row.name)).toEqual(
      expect.arrayContaining(['김담당', '박재민', '이수진', '최민호', '정하나', '오세훈']),
    )
    expect(names).toEqual(expect.arrayContaining(['마케팅', '박재민', '오세훈', '3층 복사실']))
    expect(COMPANY_ASSET_ITEMS.map((item) => item.name)).toEqual(
      expect.arrayContaining(['책상', '의자', '회의탁자', '서랍장', '컴퓨터', '모니터', '복합기']),
    )
    expect(sampleAssetNames()).toEqual(
      expect.arrayContaining(['책상', '의자', '회의탁자', '컴퓨터', '모니터', '복합기']),
    )
    expect(SAMPLE_ASSETS.every((asset) => COMPANY_ASSET_ITEMS.some((item) => item.id === asset.itemId))).toBe(true)
    expect(statements.some((row) => row.sql.includes('update employees set'))).toBe(true)
    expect(statements.some((row) => row.sql.includes('employment_checks'))).toBe(true)
    expect(SAMPLE_CONTRACTS).toHaveLength(4)
    expect(sampleContractTitles()).toEqual(
      expect.arrayContaining(['사무실 임대', '복합기 유지보수', '인터넷 전용회선', '영업배상 책임보험']),
    )
    expect(names).toEqual(expect.arrayContaining(['한국임대', '삼성화재', 'CON-2024-001']))
    expect(statements.some((row) => row.sql.includes('insert or ignore into contracts'))).toBe(true)
  })

  it('기본 시드가 샘플 직원·자산을 insert or ignore 한다', async () => {
    const names: string[] = []
    await writeDefaultMaster(
      {
        exec: async (_sql, params) => {
          for (const value of params ?? []) {
            if (typeof value === 'string') names.push(value)
          }
        },
      },
      { companyCode: 'HQ01' },
    )
    expect(names).toEqual(
      expect.arrayContaining(['박재민', '이수진', '오세훈', '모니터', '복합기', '2층 개발석', 'CON-2024-001']),
    )
    expect(names).toEqual(expect.arrayContaining(['한국임대', '02-3456-1000', '1588-5114']))
  })

  it('팔 회사 시드는 본사 샘플 사람을 넣지 않는다', async () => {
    const names: string[] = []
    const sqls: string[] = []
    await writeDefaultMaster(
      {
        exec: async (sql, params) => {
          sqls.push(sql)
          for (const value of params ?? []) {
            if (typeof value === 'string') names.push(value)
          }
        },
      },
      { companyCode: 'boam' },
    )
    expect(names).toContain('기본창고')
    expect(names).not.toContain('본사창고')
    expect(names).not.toContain('박재민')
    expect(names).not.toContain('CON-2024-001')
    expect(names).not.toContain('복사용지')
    expect(names).not.toContain('책상')
    expect(sqls.some((sql) => sql.includes('delete from employees'))).toBe(true)
    expect(sqls.some((sql) => sql.includes('delete from items') && sql.includes('stock_ledger'))).toBe(true)
  })

  it('회사 코드가 없으면 본사 샘플을 넣지 않는다', async () => {
    const names: string[] = []
    const sqls: string[] = []
    await writeDefaultMaster({
      exec: async (sql, params) => {
        sqls.push(sql)
        for (const value of params ?? []) {
          if (typeof value === 'string') names.push(value)
        }
      },
    })
    expect(names).toContain('총무')
    expect(names).not.toContain('복사용지')
    expect(names).not.toContain('김담당')
    expect(names).not.toContain('책상')
    expect(sqls.some((sql) => sql.includes('delete from employees'))).toBe(false)
  })

  it('같은 이름 정리 때 sqlite query의 this를 잃지 않는다', async () => {
    class FakeSqlite {
      sendCount = 0
      async send(_kind: string) {
        this.sendCount += 1
        return []
      }
      async exec() {
        await this.send('exec')
      }
      async query<T>(): Promise<T[]> {
        return (await this.send('query')) as T[]
      }
    }
    const db = new FakeSqlite()
    await writeDefaultMaster(db)
    expect(db.sendCount).toBeGreaterThan(0)
  })
})
