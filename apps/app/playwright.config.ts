import {
  defineConfig,
  devices,
  type ReporterDescription,
} from '@playwright/test';

const PORT = Number(process.env['PLAYWRIGHT_PORT'] ?? '3100');
const BASE_URL =
  process.env['PLAYWRIGHT_BASE_URL'] ?? `http://127.0.0.1:${PORT}`;

const CI_REPORTER: ReporterDescription[] = [
  ['list'],
  ['html', { open: 'never' }],
];

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /\.spec\.ts$/,
  fullyParallel: false,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  workers: 1,
  reporter: process.env['CI'] ? CI_REPORTER : 'list',
  globalTimeout: 15 * 60 * 1000,
  timeout: 90_000,
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    video: 'off',
    screenshot: 'only-on-failure',
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
  },
});
