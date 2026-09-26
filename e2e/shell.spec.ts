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
  await expect(page.getByText('운영 권한')).toHaveCount(0)
  await expect(page.getByText('접혀 있습니다')).toHaveCount(0)
  await expect(page.getByText('책상·컴퓨터는 직원에게 배정하지 않습니다')).toHaveCount(0)
  await page.getByRole('heading', { name: /클라우드에 업무를/ }).scrollIntoViewIfNeeded()
  await expect(page.getByRole('heading', { name: /클라우드에 업무를/ })).toBeVisible()
  const stockStory = page.getByText('발주·검수는 더 보기에서 엽니다')
  await stockStory.scrollIntoViewIfNeeded()
  await expect(stockStory).toBeVisible()
})

test('로그아웃 회사 설정은 로그인 안내만 두고 초대를 두지 않는다', async ({ page }) => {
  await page.goto('/settings')
  await expect(page.getByText('회사 설정은 로그인한 뒤 봅니다.')).toBeVisible()
  await expect(page.getByRole('button', { name: '초대 남기기' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: '회사 설정' })).toHaveCount(0)
  await expect(page.getByText('모듈은 운영 계정만 바꿉니다.')).toHaveCount(0)
  await expect(page.getByText('추가 사람은 붙이지 않습니다.')).toHaveCount(0)
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
  await expect(page.getByText('비품 수량')).toHaveCount(0)
  await page.getByLabel('명령').selectOption('post_issue')
  await expect(page.getByLabel('반출 성명')).toHaveValue('')
  await page.getByRole('button', { name: '발주·검수 더 보기' }).click()
  await page.getByLabel('명령').selectOption('draft_order')
  await expect(page.getByLabel('발주 번호')).toHaveValue('')
  await page.getByLabel('명령').selectOption('adjust_stock')
  await expect(page.getByLabel('실사 사유')).toHaveValue('')
  await expect(page.getByText('실사 차이')).toHaveCount(0)
  await page.getByLabel('명령').selectOption('post_supplier_return')
  await expect(page.getByText(/아직입니다/)).toHaveCount(0)
  await expect(page.getByText('책상·컴퓨터는 자산입니다')).toHaveCount(0)
  await expect(page.getByText('책상·컴퓨터는 그대로 자산입니다')).toHaveCount(0)
  await expect(page.getByRole('link', { name: '가구·컴퓨터는 자산' })).toHaveCount(0)
})

test('게스트 입퇴사는 샘플 직원이 있으면 명찰을 둔다', async ({ page }) => {
  await page.goto('/guest/people')
  await expect(page.getByRole('heading', { name: '직원·입퇴사' })).toBeVisible({ timeout: 20000 })
  await expect(page.getByRole('heading', { name: '명찰 템플릿' })).toBeVisible()
  await expect(page.getByText('모듈은 운영 계정만 바꿉니다.')).toHaveCount(0)
  await expect(page.getByPlaceholder('슬랙 Incoming Webhook')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '퇴사 0' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '재직 0' })).toHaveCount(0)
  await expect(page.getByText('지급 전 · 입사 중 프로세스부터')).toHaveCount(0)
})

test('게스트 기준정보는 VFS 안내와 다시 열기를 두지 않는다', async ({ page }) => {
  await page.goto('/guest/master')
  await expect(page.getByRole('heading', { name: '기준정보' })).toBeVisible({ timeout: 20000 })
  await expect(page.getByRole('button', { name: '이 회사 DB 다시 열기' })).toHaveCount(0)
  await expect(page.getByText(/VFS/)).toHaveCount(0)
  await expect(page.getByPlaceholder('PAPER')).toHaveCount(0)
  await page.getByRole('button', { name: '품목' }).click()
  await expect(page.getByPlaceholder('일반 비품')).toHaveCount(0)
  await page.getByRole('button', { name: '거래처' }).click()
  await expect(page.getByPlaceholder('02-1234-5678')).toHaveCount(0)
  await page.getByRole('button', { name: '필드' }).click()
  await expect(page.getByPlaceholder('필드 키')).toHaveValue('')
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
  await expect(page.getByRole('heading', { name: '이력 0' })).toHaveCount(0)
})

test('로그아웃 데이터 관리는 로그인 안내만 두고 백업 줄을 두지 않는다', async ({ page }) => {
  await page.goto('/data')
  await expect(page.getByText('데이터 관리는 로그인한 뒤 봅니다.')).toBeVisible()
  await expect(page.getByRole('heading', { name: '데이터 관리' })).toHaveCount(0)
  await expect(page.getByText('최근 백업')).toHaveCount(0)
  await expect(page.getByText('전송 대기')).toHaveCount(0)
  await expect(page.getByText('백업과 복원')).toHaveCount(0)
  await expect(page.getByText('처리 확인 필요')).toHaveCount(0)
})

test('로그인은 운영 권한 용어를 두지 않는다', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByRole('heading', { name: '로그인' }).first()).toBeVisible()
  await expect(page.getByText('계정이 없으면 아래 회원가입에서 만듭니다.')).toBeVisible()
  await expect(page.getByText(/app_metadata/)).toHaveCount(0)
  await expect(page.getByText(/운영 권한/)).toHaveCount(0)
})

test('로그아웃 업무 메뉴 주소는 로그인 안내만 둔다', async ({ page }) => {
  const rows = [
    ['/master', '기준정보는 로그인 후', '기준정보'],
    ['/assets', '자산은 로그인 후', '자산'],
    ['/people', '입퇴사는 로그인 후', '직원·입퇴사'],
    ['/contracts', '계약은 로그인 후', '계약'],
  ] as const
  for (const [path, hint, heading] of rows) {
    await page.goto(path)
    await expect(page.getByText(hint)).toBeVisible()
    await expect(page.getByRole('heading', { name: heading, exact: true })).toHaveCount(0)
  }
})

test('게스트 홈은 샘플만 두고 지정 PC 원본을 열지 않는다', async ({ page }) => {
  await page.goto('/guest')
  await expect(page.getByRole('heading', { name: '샘플 회사' })).toBeVisible()
  await expect(page.getByText('이 PC에 남지 않습니다')).toBeVisible()
  await expect(page.getByRole('navigation').getByRole('link', { name: '회사 관리' })).toHaveCount(0)
  await expect(page.getByText('김담당')).toHaveCount(0)
  await expect(page.getByText('책상·컴퓨터와 빈 QR')).toHaveCount(0)
})

test('게스트 계약은 본사 김담당을 두지 않는다', async ({ page }) => {
  await page.goto('/guest/contracts')
  await expect(page.getByRole('heading', { name: '계약' }).first()).toBeVisible({ timeout: 20000 })
  await expect(page.getByText('김담당')).toHaveCount(0)
  await expect(page.getByText('백업')).toHaveCount(0)
})

test('로그아웃 회사 관리는 로그인 안내만 두고 운영 필드 이름을 두지 않는다', async ({ page }) => {
  await page.goto('/ops/companies')
  await expect(page.getByText('회사 등록은 로그인한 운영 관리자만')).toBeVisible()
  await expect(page.getByRole('heading', { name: '회사 관리' })).toHaveCount(0)
  await expect(page.getByText(/app_metadata/)).toHaveCount(0)
})

test('없는 주소와 게스트에 없는 화면은 한글만 둔다', async ({ page }) => {
  await page.goto('/reports')
  await expect(page.getByText('이 주소는 없습니다.')).toBeVisible()
  await expect(page.getByRole('link', { name: '홈으로' })).toBeVisible()
  await page.goto('/guest/settings')
  await expect(page.getByText('샘플에는 이 화면이 없습니다.')).toBeVisible()
  await expect(page.getByRole('heading', { name: '회사 설정' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '초대 남기기' })).toHaveCount(0)
})

test('로그인 다음 주소는 바깥으로 새지 않는다', async ({ page }) => {
  await page.goto('/login?next=https://evil.example')
  await expect(page.getByRole('heading', { name: '로그인' }).first()).toBeVisible()
  await expect(page.getByRole('heading', { name: '회원가입' })).toBeVisible()
  await expect(page.getByText('https://evil.example')).toHaveCount(0)
  await expect(page.getByRole('link', { name: '이어서' })).toHaveCount(0)
})

test('게스트 잘못된 QR은 샘플 안내만 둔다', async ({ page }) => {
  await page.goto('/guest/q/not-a-token')
  await expect(page.getByText('이 QR은 샘플에서 만든 빈 QR이 아닙니다.')).toBeVisible()
})

test('배포 헤더는 클릭재킹과 혼합 콘텐츠를 막는다', async ({ page }) => {
  const response = await page.goto('/')
  const headers = response?.headers() ?? {}
  const csp = headers['content-security-policy'] ?? ''
  expect(headers['x-frame-options']?.toLowerCase()).toBe('deny')
  expect(csp).toContain("default-src 'self'")
  expect(csp).toContain('upgrade-insecure-requests')
  expect(csp).toContain("script-src-attr 'none'")
  expect(csp).not.toContain('*.supabase.co')
  expect(headers['cross-origin-opener-policy']).toBe('same-origin')
})
