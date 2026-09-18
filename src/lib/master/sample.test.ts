import { describe, expect, it } from 'vitest'
import { COMPANY_ASSET_ITEMS, writeDefaultMaster } from './book'
import { SAMPLE_ASSETS, SAMPLE_EMPLOYEES, sampleAssetNames, writeSampleCompanyData } from './sample'

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
    expect(names).toEqual(expect.arrayContaining(['마케팅', '박재민', '오세훈', '본사 3층 복사실']))
    expect(COMPANY_ASSET_ITEMS.map((item) => item.name)).toEqual(
      expect.arrayContaining(['책상', '의자', '회의탁자', '서랍장', '컴퓨터', '모니터', '복합기']),
    )
    expect(sampleAssetNames()).toEqual(
      expect.arrayContaining(['책상', '의자', '회의탁자', '컴퓨터', '모니터', '복합기']),
    )
    expect(SAMPLE_ASSETS.every((asset) => COMPANY_ASSET_ITEMS.some((item) => item.id === asset.itemId))).toBe(true)
    expect(statements.some((row) => row.sql.includes('employment_checks'))).toBe(true)
  })

  it('기본 시드가 샘플 직원·자산을 insert or ignore 한다', async () => {
    const names: string[] = []
    await writeDefaultMaster({
      exec: async (_sql, params) => {
        for (const value of params ?? []) {
          if (typeof value === 'string') names.push(value)
        }
      },
    })
    expect(names).toEqual(
      expect.arrayContaining(['박재민', '이수진', '오세훈', '모니터', '복합기', '본사 2층 개발석']),
    )
  })
})
