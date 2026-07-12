import { spawnSync } from 'node:child_process';

if (process.env.EAS_BUILD === 'true') {
  console.log(
    'Skipping Playwright browser installation during EAS native builds.',
  );
  process.exit(0);
}

const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const result = spawnSync(
  pnpmCommand,
  ['exec', 'playwright', 'install', 'chromium'],
  {
    cwd: process.cwd(),
    stdio: 'inherit',
  },
);

if (result.error) {
  console.error(
    'Failed to start Playwright browser installation:',
    result.error,
  );
  process.exit(1);
}

process.exit(result.status ?? 1);
