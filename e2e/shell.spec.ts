import { expect, test } from '@playwright/test'

test('한글 셸과 회사 관리 메뉴가 보인다', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '홈' })).toBeVisible()
  await page.getByRole('link', { name: '회사 관리' }).click()
  await expect(page.getByRole('heading', { name: '회사 관리' })).toBeVisible()
  await page.getByRole('link', { name: '초기 설정' }).click()
  await expect(page.getByRole('heading', { name: '지정 PC 초기 설정' })).toBeVisible()
})
