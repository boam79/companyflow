import { describe, expect, it } from 'vitest'
import { canWriteOpenedCompany, mayOpenCompanyWork, workSessionKind } from './workGate'

const HQ = {
  id: 'co-1',
  display_name: '본사',
  company_code: 'HQ01',
  registration_status: 'confirmed',
}

describe('업무 원본 가드', () => {
  it('게스트가 아니면 멤버십 회사만 연다', () => {
    expect(mayOpenCompanyWork(true, 'guest-demo', [])).toBe(true)
    expect(mayOpenCompanyWork(true, HQ.id, [HQ])).toBe(false)
    expect(mayOpenCompanyWork(false, HQ.id, [HQ])).toBe(true)
    expect(mayOpenCompanyWork(false, 'co-2', [HQ])).toBe(false)
    expect(mayOpenCompanyWork(false, '', [HQ])).toBe(false)
  })

  it('쓰기는 연 회사 sqlite와 멤버십이 같을 때만 한다', () => {
    expect(canWriteOpenedCompany(true, 'guest-demo', 'guest-demo')).toBe(true)
    expect(canWriteOpenedCompany(true, 'guest-demo', HQ.id)).toBe(false)
    expect(canWriteOpenedCompany(false, HQ.id, HQ.id)).toBe(true)
    expect(canWriteOpenedCompany(false, '', HQ.id)).toBe(false)
    expect(canWriteOpenedCompany(false, HQ.id, 'co-2')).toBe(false)
  })

  it('회사 없는 계정은 로그인 안내 다음에 연결 없음을 본다', () => {
    expect(workSessionKind({ guest: false, signedIn: false, ready: true, companyId: '' })).toBe('login')
    expect(workSessionKind({ guest: false, signedIn: true, ready: false, companyId: '' })).toBe('loading')
    expect(workSessionKind({ guest: false, signedIn: true, ready: true, companyId: '' })).toBe('no-company')
    expect(workSessionKind({ guest: false, signedIn: true, ready: true, companyId: HQ.id })).toBe('ok')
    expect(workSessionKind({ guest: true, signedIn: false, ready: true, companyId: 'guest-demo' })).toBe('ok')
  })
})
