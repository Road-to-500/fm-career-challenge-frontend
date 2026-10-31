import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:5176',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
    { name: 'desktop-light', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-light', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'npx vite --host 127.0.0.1 --port 5176 --strictPort',
    url: 'http://127.0.0.1:5176',
    env: { API_PROXY_TARGET: 'http://127.0.0.1:5196' },
    reuseExistingServer: false,
    timeout: 60_000,
  },
})
