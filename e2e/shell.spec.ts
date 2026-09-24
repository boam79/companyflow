import { expect, test } from '@playwright/test'

test('로그아웃 홈은 둘러보기와 로그인만 둔다', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /회사별 지정 PC/ })).toBeVisible()
  await expect(page.getByRole('navigation').getByRole('link', { name: '로그인' })).toBeVisible()
  await expect(page.getByRole('link', { name: '둘러보기' }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: /수락/ })).toHaveCount(0)
  await expect(page.getByRole('navigation').getByRole('link', { name: '회사 관리' })).toHaveCount(0)
  await expect(page.getByRole('navigation').getByRole('link', { name: '초기 설정' })).toHaveCount(0)
  await expect(page.getByRole('navigation').getByRole('link', { name: '구매·재고' })).toHaveCount(0)
})

test('로그아웃 구매·재고 주소는 로그인 안내만 둔다', async ({ page }) => {
  await page.goto('/stock')
  await expect(page.getByText('구매·재고는 로그인 후')).toBeVisible()
  await expect(page.getByRole('heading', { name: '구매·재고' })).toHaveCount(0)
})

test('잘못된 QR은 한글 안내만 둔다', async ({ page }) => {
  await page.goto('/q/not-a-token')
  await expect(page.getByText('이 QR은 회사 PC에서 만든 빈 QR이 아닙니다.')).toBeVisible()
})

test('게스트 둘러보기는 샘플 구매부터 연다', async ({ page }) => {
  await page.goto('/guest/stock')
  await expect(page.getByRole('heading', { name: '구매·재고' })).toBeVisible({ timeout: 20000 })
})
