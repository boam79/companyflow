import { expect, test } from '@playwright/test'
import { GUEST_BLANK_QR_ID } from '../src/lib/guest/seed'
import { qrLoginHref } from '../src/lib/loginNext'

test('빈 로그인도 영어를 두지 않는다', async ({ page }) => {
  await page.goto('/login')
  await page.locator('form').filter({ has: page.locator('input[name="loginPassword"]') }).getByRole('button', { name: '로그인' }).click()
  await expect(page.getByText(/Invalid login/i)).toHaveCount(0)
  await expect(page.getByText(/invalid_credentials/i)).toHaveCount(0)
  await expect(page.getByText(/Unable to validate/i)).toHaveCount(0)
})

test('잘못된 비밀번호는 한글만 보여 준다', async ({ page }) => {
  await page.goto('/login')
  await page.locator('input[name="loginEmail"]').fill('nobody@example.invalid')
  await page.locator('input[name="loginPassword"]').fill('wrong-pass-1234')
  await page.locator('form').filter({ has: page.locator('input[name="loginPassword"]') }).getByRole('button', { name: '로그인' }).click()
  await expect(page.getByText('이메일 또는 비밀번호가 올바르지 않습니다.')).toBeVisible({ timeout: 15000 })
  await expect(page.getByText(/Invalid login/i)).toHaveCount(0)
  await expect(page.getByText(/invalid_credentials/i)).toHaveCount(0)
})

test('로그인 next 공격 값은 화면에 남지 않는다', async ({ page }) => {
  const attacks = [
    'https://evil.example',
    '//evil.example',
    '/ops/companies',
    '/settings',
    `/guest/q/${GUEST_BLANK_QR_ID}`,
    'javascript:alert(1)',
    `/Q/${GUEST_BLANK_QR_ID}`,
    `/q/${GUEST_BLANK_QR_ID}/../ops`,
  ]
  for (const next of attacks) {
    await page.goto(`/login?next=${encodeURIComponent(next)}`)
    await expect(page.getByRole('heading', { name: '로그인' }).first()).toBeVisible()
    await expect(page.getByText(next, { exact: true })).toHaveCount(0)
    await expect(page.getByRole('link', { name: '이어서' })).toHaveCount(0)
  }
  await page.goto(`/login?next=${encodeURIComponent(`/q/${GUEST_BLANK_QR_ID}`)}`)
  await expect(page.getByRole('heading', { name: '로그인' }).first()).toBeVisible()
  await expect(page.getByRole('link', { name: '이어서' })).toHaveCount(0)
})

test('빈 QR 로그인 주소는 허용된 next만 붙인다', async ({ page }) => {
  await page.goto(`/q/${GUEST_BLANK_QR_ID}`)
  const href = await page.getByRole('main').getByRole('link', { name: '로그인' }).getAttribute('href')
  expect(href).toBe(qrLoginHref(GUEST_BLANK_QR_ID))
})
