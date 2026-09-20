import { afterEach, describe, expect, it } from 'vitest'
import {
  clearCompanySession,
  initialCompanySession,
  lastOpenedCompanyId,
  rememberCompanies,
  rememberOpenedCompany,
  rememberedCompanies,
  seedInvalidCompanyList,
} from './companySession'

const HQ = {
  id: 'co-1',
  display_name: '본사',
  company_code: 'HQ01',
  registration_status: 'confirmed',
}

const BRANCH = {
  id: 'co-2',
  display_name: '지점',
  company_code: 'BR01',
  registration_status: 'admin_linked',
}

describe('회사 세션', () => {
  afterEach(() => {
    clearCompanySession()
  })

  it('마지막으로 연 회사와 목록을 세션에 남긴다', () => {
    rememberCompanies([HQ])
    rememberOpenedCompany(HQ.id)
    expect(lastOpenedCompanyId()).toBe('co-1')
    expect(rememberedCompanies()).toEqual([HQ])
  })

  it('이미 열린 sqlite 회사를 세션보다 먼저 고른다', () => {
    rememberCompanies([HQ, BRANCH])
    rememberOpenedCompany(BRANCH.id)
    expect(initialCompanySession(HQ.id)).toEqual({
      companies: [HQ, BRANCH],
      companyId: HQ.id,
    })
  })

  it('sqlite가 비어 있으면 세션에 남은 회사를 쓴다', () => {
    rememberCompanies([HQ])
    rememberOpenedCompany(HQ.id)
    expect(initialCompanySession('')).toEqual({
      companies: [HQ],
      companyId: HQ.id,
    })
  })

  it('목록만 있고 마지막 회사가 없으면 첫 회사를 고른다', () => {
    rememberCompanies([HQ, BRANCH])
    expect(initialCompanySession('').companyId).toBe(HQ.id)
  })

  it('목록에 없는 마지막 회사는 첫 회사로 되돌린다', () => {
    rememberCompanies([HQ])
    rememberOpenedCompany('co-999')
    expect(initialCompanySession('').companyId).toBe(HQ.id)
  })

  it('경로 문자가 있는 회사 id는 세션에 남기지 않는다', () => {
    rememberOpenedCompany('../etc/passwd')
    expect(lastOpenedCompanyId()).toBe('')
  })

  it('깨진 세션 값은 빈 목록이다', () => {
    seedInvalidCompanyList()
    expect(rememberedCompanies()).toEqual([])
    expect(initialCompanySession('').companyId).toBe('')
  })
})
