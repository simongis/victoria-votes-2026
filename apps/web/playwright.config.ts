import { defineConfig, devices } from '@playwright/test'

// E2E_BASE_URL points the tests at an already running dev server (no second server is started).
const external = process.env.E2E_BASE_URL

export default defineConfig({
  testDir: './e2e',
  // A cold page load evaluates about 260 ArcGIS chunks: 7 to 19 s on this laptop when another worker is busy (measured
  // 1 Nov, VE-70), and most specs load the page at least once. The Playwright default of 30 s per test sat inside that.
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'html' : 'line',
  use: {
    // Port 5182 is this project's own test port, strict, so another project's dev server on Vite's default 5173 is never
    // mistaken for this app (8 Nov: bushfireOperations held 5173 and every spec silently tested the wrong app).
    baseURL: external ?? 'http://localhost:5182',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: external ? undefined : {
    command: 'npm run dev -- --port 5182 --strictPort',
    url: 'http://localhost:5182',
    reuseExistingServer: !process.env.CI,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
