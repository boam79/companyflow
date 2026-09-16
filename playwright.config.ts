import { defineConfig, devices } from '@playwright/test'

const baseURL = process.env.PLAYWRIGHT_BASE_URL

if (!baseURL || baseURL.includes('localhost') || baseURL.includes('127.0.0.1')) {
  throw new Error('PLAYWRIGHT_BASE_URL은 배포된 HTTPS URL이어야 합니다.')
}

export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL,
    ...devices['Desktop Chrome'],
  },
})
