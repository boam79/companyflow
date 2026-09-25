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
  await expect(page.getByRole('button', { name: '계정 삭제' })).toHaveCount(0)
})

test('로그아웃 회사 설정은 로그인 안내만 두고 초대를 두지 않는다', async ({ page }) => {
  await page.goto('/settings')
  await expect(page.getByText('회사 설정은 로그인한 뒤 봅니다.')).toBeVisible()
  await expect(page.getByRole('button', { name: '초대 남기기' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: '회사 설정' })).toHaveCount(0)
  await expect(page.getByText('모듈은 운영 계정만 바꿉니다.')).toHaveCount(0)
})

test('로그아웃 초기 설정 주소는 로그인 안내만 둔다', async ({ page }) => {
  await page.goto('/setup')
  await expect(page.getByText('지정 PC 설정은 로그인 후')).toBeVisible()
  await expect(page.getByRole('heading', { name: '지정 PC 초기 설정' })).toHaveCount(0)
})

test('로그아웃 구매 주소는 로그인 안내만 둔다', async ({ page }) => {
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
  await expect(page.getByText('회사 선택')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '이 회사 DB 다시 열기' })).toHaveCount(0)
  await expect(page.getByText(/VFS/)).toHaveCount(0)
  await expect(page.getByRole('cell', { name: '샘플 복사용지' }).first()).toBeVisible()
  await page.getByLabel('명령').selectOption('post_issue')
  await expect(page.getByLabel('반출 성명')).toHaveValue('')
  await page.getByRole('button', { name: '발주·검수 더 보기' }).click()
  await page.getByLabel('명령').selectOption('draft_order')
  await expect(page.getByLabel('발주 번호')).toHaveValue('')
})

test('게스트 입퇴사는 샘플 직원이 있으면 명찰을 둔다', async ({ page }) => {
  await page.goto('/guest/people')
  await expect(page.getByRole('heading', { name: '직원·입퇴사' })).toBeVisible({ timeout: 20000 })
  await expect(page.getByRole('heading', { name: '명찰 템플릿' })).toBeVisible()
  await expect(page.getByText('모듈은 운영 계정만 바꿉니다.')).toHaveCount(0)
})

test('게스트 기준정보는 VFS 안내와 다시 열기를 두지 않는다', async ({ page }) => {
  await page.goto('/guest/master')
  await expect(page.getByRole('heading', { name: '기준정보' })).toBeVisible({ timeout: 20000 })
  await expect(page.getByRole('button', { name: '이 회사 DB 다시 열기' })).toHaveCount(0)
  await expect(page.getByText(/VFS/)).toHaveCount(0)
})

test('게스트 자산은 본사 복사용지 안내를 두지 않는다', async ({ page }) => {
  await page.goto('/guest/assets')
  await expect(page.getByRole('heading', { name: '자산', exact: true })).toBeVisible({ timeout: 20000 })
  await expect(page.getByRole('button', { name: '이 회사 DB 다시 열기' })).toHaveCount(0)
  await expect(page.getByText(/VFS/)).toHaveCount(0)
  await expect(page.getByText('복사용지 같은 비품')).toHaveCount(0)
  await expect(page.getByText('샘플로 넣은 책상')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: '스마트폰에서 저장 0' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: '회사 자산 0' })).toHaveCount(0)
})

test('로그아웃 데이터 관리는 로그인 안내만 두고 백업 줄을 두지 않는다', async ({ page }) => {
  await page.goto('/data')
  await expect(page.getByText('데이터 관리는 로그인한 뒤 봅니다.')).toBeVisible()
  await expect(page.getByRole('heading', { name: '데이터 관리' })).toHaveCount(0)
  await expect(page.getByText('최근 백업')).toHaveCount(0)
  await expect(page.getByText('전송 대기')).toHaveCount(0)
})
