import { expect, test } from '@playwright/test'
import { GUEST_BLANK_QR_ID } from '../src/lib/guest/seed'
import { expectNoHqLeftovers, trackSupabaseMutations } from './helpers'

test('게스트 기준정보 부서·품목·직원을 저장하고 영어 상태를 두지 않는다', async ({ page }) => {
  const writes = trackSupabaseMutations(page)
  await page.goto('/guest/master')
  await expect(page.getByRole('heading', { name: '기준정보' })).toBeVisible({ timeout: 20000 })
  await page.getByRole('button', { name: '부서', exact: true }).click()
  await page.getByPlaceholder('부서 이름').fill('샘플품질')
  await page.getByRole('button', { name: '추가', exact: true }).click()
  await expect(page.getByText('저장했습니다. (부서)')).toBeVisible()
  await expect(page.getByText('샘플품질')).toBeVisible()
  await page.getByRole('button', { name: '품목' }).click()
  await page.getByPlaceholder('품목 이름').fill('샘플클립')
  await page.getByRole('button', { name: '추가', exact: true }).click()
  await expect(page.getByText('저장했습니다. (품목)')).toBeVisible()
  await page.getByRole('button', { name: '직원' }).click()
  await page.getByPlaceholder('직원 이름').fill('견본 테스트')
  await page.getByRole('button', { name: '추가', exact: true }).click()
  await expect(page.getByText('저장했습니다. (직원)')).toBeVisible()
  await expect(page.getByText('견본 테스트')).toBeVisible()
  await expectNoHqLeftovers(page)
  expect(writes).toEqual([])
})

test('게스트 반출은 견본 이름으로 저장하고 중앙 쓰기를 하지 않는다', async ({ page }) => {
  const writes = trackSupabaseMutations(page)
  await page.goto('/guest/stock')
  await expect(page.getByRole('heading', { name: '구매·재고' })).toBeVisible({ timeout: 20000 })
  await page.getByLabel('명령').selectOption('post_issue')
  await page.getByPlaceholder('이름을 치세요').fill('샘플 복사용지')
  await page.getByLabel('수량').fill('1')
  await page.getByLabel('반출 성명').fill('견본 김대리')
  await page.getByRole('button', { name: '반출', exact: true }).click()
  await expect(page.getByText('저장했습니다. (반출)')).toBeVisible()
  await expect(page.getByText('견본 김대리')).toBeVisible()
  await expect(page.getByText('거래 번호')).toHaveCount(0)
  await expect(page.getByText(/직전 거래:/)).toHaveCount(0)
  await expectNoHqLeftovers(page)
  expect(writes).toEqual([])
})

test('게스트 계약 이름에 스크립트를 넣어도 실행되지 않는다', async ({ page }) => {
  const dialogs: string[] = []
  page.on('dialog', (dialog) => {
    dialogs.push(dialog.message())
    void dialog.dismiss()
  })
  await page.goto('/guest/contracts')
  await expect(page.getByRole('heading', { name: '계약' }).first()).toBeVisible({ timeout: 20000 })
  await page.getByRole('button', { name: '새 초안' }).click()
  await page.getByLabel('계약명').fill('<img src=x onerror=alert(1)>')
  await page.getByLabel('상대방').fill('<script>alert(1)</script>')
  await page.getByRole('button', { name: '초안 저장' }).click()
  await expect(page.getByText('계약 초안을 저장했습니다.')).toBeVisible()
  await expect(page.getByRole('heading', { name: '<img src=x onerror=alert(1)>' })).toBeVisible()
  expect(dialogs).toEqual([])
})

test('게스트 빈 QR 위치 스크립트는 텍스트로만 남고 중앙에 쓰지 않는다', async ({ page }) => {
  const writes = trackSupabaseMutations(page)
  const dialogs: string[] = []
  page.on('dialog', (dialog) => {
    dialogs.push(dialog.message())
    void dialog.dismiss()
  })
  await page.goto(`/guest/q/${GUEST_BLANK_QR_ID}`)
  await expect(page.getByRole('heading', { name: '자산 정보 입력' })).toBeVisible({ timeout: 20000 })
  await page.getByLabel('품목').selectOption('샘플 책상')
  await page.getByLabel('위치').fill('<svg onload=alert(1)>')
  await page.getByRole('button', { name: '저장' }).click()
  await expect(page.getByText('샘플에 저장했습니다. 지정 PC 원본은 건드리지 않습니다.')).toBeVisible()
  expect(dialogs).toEqual([])
  expect(writes).toEqual([])
})
