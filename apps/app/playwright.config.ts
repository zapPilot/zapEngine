import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env['PLAYWRIGHT_PORT'] ?? '3100');
const BASE_URL =
  process.env['PLAYWRIGHT_BASE_URL'] ?? `http://127.0.0.1:${PORT}`;
const PRIVY_PLACEHOLDER =
  process.env['EXPO_PUBLIC_PRIVY_APP_ID'] ?? 'e2eprivyappidplaceholder0';
const PRIVY_CLIENT_PLACEHOLDER =
  process.env['EXPO_PUBLIC_PRIVY_CLIENT_ID'] ?? 'e2eprivyclientplaceholder';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /\.spec\.ts$/,
  fullyParallel: false,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  workers: 1,
  reporter: process.env['CI'] ? 'html' : 'list',
  globalTimeout: 10 * 60 * 1000,
  timeout: 30 * 1000,
  use: {
    baseURL: BASE_URL,
    trace: 'off',
    video: 'off',
    screenshot: 'off',
    viewport: { width: 390, height: 844 },
    ignoreHTTPSErrors: true,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `node scripts/serve-web.mjs --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env['CI'],
    timeout: 180 * 1000,
    env: {
      EXPO_PUBLIC_PRIVY_APP_ID: PRIVY_PLACEHOLDER,
      EXPO_PUBLIC_PRIVY_CLIENT_ID: PRIVY_CLIENT_PLACEHOLDER,
    },
  },
});
