import { expect, type Page } from '@playwright/test'

export const HQ_LEFTOVERS = [
  '김담당',
  '본사창고',
  'app_metadata',
  '운영 권한',
  'Incoming Webhook',
  '백업과 복원',
  '최근 백업',
  '전송 대기',
  '책상·컴퓨터는 직원에게 배정하지 않습니다',
  '모듈은 운영 계정만 바꿉니다.',
  'Invalid login',
  'UNIQUE constraint',
  'JWT expired',
] as const

export async function expectNoHqLeftovers(page: Page) {
  for (const text of HQ_LEFTOVERS) {
    await expect(page.getByText(text)).toHaveCount(0)
  }
  await expect(page.getByText(/operation_id/)).toHaveCount(0)
  await expect(page.getByText(/\bapplied\b/)).toHaveCount(0)
  await expect(page.getByText(/직전 거래:/)).toHaveCount(0)
}

export function trackSupabaseMutations(page: Page) {
  const hits: string[] = []
  page.on('request', (req) => {
    const method = req.method()
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return
    const url = req.url()
    if (!url.includes('supabase.co')) return
    if (url.includes('/auth/v1/')) return
    hits.push(`${method} ${url}`)
  })
  return hits
}

export async function expectSecureHeaders(page: Page, path: string) {
  const response = await page.goto(path)
  const headers = response?.headers() ?? {}
  expect(headers['x-frame-options']?.toLowerCase()).toBe('deny')
  expect(headers['content-security-policy'] ?? '').toContain("default-src 'self'")
  expect(headers['content-security-policy'] ?? '').toContain('upgrade-insecure-requests')
  expect((headers['content-security-policy'] ?? '').replaceAll('wasm-unsafe-eval', '')).not.toContain('unsafe-eval')
  expect(headers['cross-origin-opener-policy']).toBe('same-origin')
  expect(headers['cross-origin-embedder-policy']).toBe('require-corp')
  expect(headers['x-content-type-options']).toBe('nosniff')
  expect(headers['strict-transport-security'] ?? '').toContain('max-age=31536000')
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin')
  expect(headers['permissions-policy'] ?? '').toContain('camera=()')
}
