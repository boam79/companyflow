import { expect, test } from '@playwright/test'
import { expectNoHqLeftovers, expectSecureHeaders } from './helpers'

const LOGOUT_GATES = [
  ['/setup', '지정 PC 설정은 로그인 후', '지정 PC 초기 설정'],
  ['/master', '기준정보는 로그인 후', '기준정보'],
  ['/stock', '구매·재고는 로그인 후', '구매·재고'],
  ['/assets', '자산은 로그인 후', '자산'],
  ['/people', '입퇴사는 로그인 후', '직원·입퇴사'],
  ['/contracts', '계약은 로그인 후', '계약'],
] as const

const MISSING_PATHS = ['/reports', '/foo', '/api', '/ops', '/guesting'] as const

const GUEST_MISSING = [
  '/guest/settings',
  '/guest/data',
  '/guest/setup',
  '/guest/ops/companies',
  '/guest/login',
  '/guest/reports',
] as const

const HEADER_PATHS = ['/', '/login', '/guest', '/q/not-a-token', '/settings'] as const

test('로그아웃 업무 주소는 로그인 안내만 두고 본사 잔재를 두지 않는다', async ({ page }) => {
  for (const [path, hint, heading] of LOGOUT_GATES) {
    await page.goto(path)
    await expect(page.getByText(hint)).toBeVisible()
    await expect(page.getByRole('heading', { name: heading, exact: true })).toHaveCount(0)
    await expectNoHqLeftovers(page)
  }
})

test('없는 주소 여러 개는 한글만 둔다', async ({ page }) => {
  for (const path of MISSING_PATHS) {
    await page.goto(path)
    await expect(page.getByText('이 주소는 없습니다.')).toBeVisible()
    await expect(page.getByRole('link', { name: '홈으로' })).toBeVisible()
    await expectNoHqLeftovers(page)
  }
})

test('게스트에 없는 화면 여러 개는 샘플 안내만 둔다', async ({ page }) => {
  for (const path of GUEST_MISSING) {
    await page.goto(path)
    await expect(page.getByText('샘플에는 이 화면이 없습니다.')).toBeVisible()
    await expect(page.getByRole('heading', { name: '회사 설정' })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: '데이터 관리' })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: '회사 관리' })).toHaveCount(0)
    await expectNoHqLeftovers(page)
  }
})

test('배포 헤더는 여러 주소에서 같다', async ({ page }) => {
  for (const path of HEADER_PATHS) {
    await expectSecureHeaders(page, path)
  }
})
