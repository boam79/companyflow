import { expect, test } from '@playwright/test'
import { GUEST_BLANK_QR_ID, GUEST_DESK_QR_ID, GUEST_PC_QR_ID } from '../src/lib/guest/seed'
import { expectNoHqLeftovers } from './helpers'

test('게스트 홈 카드는 샘플 업무만 연다', async ({ page }) => {
  await page.goto('/guest')
  await expect(page.getByRole('heading', { name: '샘플 회사' })).toBeVisible()
  const cards = [
    [/입고·반출·재고현황/, '/guest/stock', '구매·재고'],
    [/빈 QR과 자리의 물건/, '/guest/assets', '자산'],
    [/견본 김대리/, '/guest/people', '직원·입퇴사'],
    [/샘플 사무실 임대/, '/guest/contracts', '계약'],
    [/부서·품목·창고/, '/guest/master', '기준정보'],
  ] as const
  for (const [hint, href, heading] of cards) {
    await page.goto('/guest')
    await page.getByRole('link', { name: hint }).click()
    await expect(page).toHaveURL(href)
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible({ timeout: 20000 })
    await expectNoHqLeftovers(page)
  }
})

test('게스트 기준정보 부서·창고·직원은 샘플만 둔다', async ({ page }) => {
  await page.goto('/guest/master')
  await expect(page.getByRole('heading', { name: '기준정보' })).toBeVisible({ timeout: 20000 })
  await page.getByRole('button', { name: '부서', exact: true }).click()
  await expect(page.getByText('샘플총무')).toBeVisible()
  await page.getByRole('button', { name: '창고' }).click()
  await expect(page.getByText('샘플창고')).toBeVisible()
  await expect(page.getByText('본사창고')).toHaveCount(0)
  await page.getByRole('button', { name: '직원' }).click()
  await expect(page.getByText('견본 김대리')).toBeVisible()
  await expect(page.getByText('김담당')).toHaveCount(0)
})

test('게스트 입퇴사 탭은 견본만 두고 본사 사람을 두지 않는다', async ({ page }) => {
  await page.goto('/guest/people')
  await expect(page.getByRole('heading', { name: '직원·입퇴사' })).toBeVisible({ timeout: 20000 })
  await page.getByRole('button', { name: /입사 중/ }).click()
  await expect(page.getByText('견본 김대리')).toBeVisible()
  await expect(page.getByText('데모 이사원')).toBeVisible()
  await page.getByRole('button', { name: /퇴사/ }).click()
  await expect(page.getByText('견본 최과장')).toBeVisible()
  await expect(page.getByRole('button', { name: /^재직/ })).toHaveCount(0)
  await expect(page.getByText('김담당')).toHaveCount(0)
  await expect(page.getByText('지급 전 · 입사 중 프로세스부터')).toHaveCount(0)
})

test('게스트 입고는 저장하고 영어 거래 번호를 두지 않는다', async ({ page }) => {
  await page.goto('/guest/stock')
  await expect(page.getByRole('heading', { name: '구매·재고' })).toBeVisible({ timeout: 20000 })
  await page.getByLabel('명령').selectOption('post_direct_in')
  await page.getByPlaceholder('이름을 치세요').fill('샘플 복사용지')
  await page.getByLabel('수량').fill('1')
  await page.getByRole('button', { name: '입고', exact: true }).click()
  await expect(page.getByText('저장했습니다. (입고)')).toBeVisible()
  await expect(page.getByText(/operation_id/)).toHaveCount(0)
  await expect(page.getByText('김담당')).toHaveCount(0)
})

test('게스트 계약 초안은 본사 김담당 없이 저장한다', async ({ page }) => {
  await page.goto('/guest/contracts')
  await expect(page.getByRole('heading', { name: '계약' }).first()).toBeVisible({ timeout: 20000 })
  await expect(page.getByText('샘플 사무실 임대')).toBeVisible()
  await page.getByRole('button', { name: '새 초안' }).click()
  await page.getByLabel('계약명').fill('샘플 청소 계약')
  await page.getByLabel('상대방').fill('견본청소')
  await page.getByRole('button', { name: '초안 저장' }).click()
  await expect(page.getByText('계약 초안을 저장했습니다.')).toBeVisible()
  await expect(page.getByText('김담당')).toHaveCount(0)
})

test('게스트 빈 QR은 샘플 품목만 넣고 지정 PC를 건드리지 않는다', async ({ page }) => {
  await page.goto(`/guest/q/${GUEST_BLANK_QR_ID}`)
  await expect(page.getByRole('heading', { name: '자산 정보 입력' })).toBeVisible({ timeout: 20000 })
  await page.getByLabel('품목').selectOption('샘플 책상')
  await page.getByLabel('위치').fill('샘플 2층')
  await page.getByRole('button', { name: '저장' }).click()
  await expect(page.getByText('샘플에 저장했습니다. 지정 PC 원본은 건드리지 않습니다.')).toBeVisible()
})

test('게스트 묶인 QR은 샘플 자산만 보여 준다', async ({ page }) => {
  await page.goto(`/guest/q/${GUEST_DESK_QR_ID}`)
  await expect(page.getByRole('heading', { name: /샘플 책상/ })).toBeVisible({ timeout: 20000 })
  await expect(page.getByText('지정 PC 원본은 건드리지 않습니다')).toBeVisible()
  await expect(page.getByText('견본 김대리')).toBeVisible()
  await page.goto(`/guest/q/${GUEST_PC_QR_ID}`)
  await expect(page.getByRole('heading', { name: /샘플 컴퓨터/ })).toBeVisible({ timeout: 20000 })
  const missing = '11111111-1111-4111-8111-111111111111'
  await page.goto(`/guest/q/${missing}`)
  await expect(page.getByText('이 QR은 샘플에서 만든 빈 QR이 아닙니다.')).toBeVisible()
})

test('로그아웃 정상 UUID QR은 로그인만 안내한다', async ({ page }) => {
  await page.goto(`/q/${GUEST_BLANK_QR_ID}`)
  await expect(page.getByText('빈 QR을 읽었습니다. 로그인 후')).toBeVisible()
  const login = page.getByRole('link', { name: '로그인' })
  await expect(login).toBeVisible()
  const href = (await login.getAttribute('href')) ?? ''
  expect(href).toContain('/login')
  expect(href).toContain(GUEST_BLANK_QR_ID)
  expect(href).not.toContain('ops')
  expect(href).not.toContain('http')
})
