#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const E2E_PRIVY_CONFIG = {
  EXPO_PUBLIC_PRIVY_APP_ID: 'e2eprivyappidplaceholder0',
  EXPO_PUBLIC_PRIVY_CLIENT_ID: 'e2eprivyclientplaceholder',
};

const appRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const webBundleRoot = join(appRoot, 'dist/web/_expo/static/js');
const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

const buildResult = spawnSync(
  pnpmCommand,
  [
    'exec',
    'expo',
    'export',
    '--platform',
    'web',
    '--output-dir',
    'dist/web',
    '--source-maps',
    '--clear',
  ],
  {
    cwd: appRoot,
    env: {
      ...process.env,
      EXPO_NO_TELEMETRY: '1',
      ...E2E_PRIVY_CONFIG,
    },
    stdio: 'inherit',
  },
);

if (buildResult.error) {
  console.error('Failed to start the Expo E2E web export:', buildResult.error);
  process.exit(1);
}

if (buildResult.status !== 0) {
  process.exit(buildResult.status ?? 1);
}

const bundleFiles = readdirSync(webBundleRoot, {
  recursive: true,
  withFileTypes: true,
})
  .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
  .map((entry) => join(entry.parentPath, entry.name));

if (bundleFiles.length === 0) {
  console.error(`No Expo web JavaScript bundles found under ${webBundleRoot}.`);
  process.exit(1);
}

const bundleSource = bundleFiles
  .map((filePath) => readFileSync(filePath, 'utf8'))
  .join('\n');
const missingConfig = Object.entries(E2E_PRIVY_CONFIG)
  .filter(([, value]) => !bundleSource.includes(value))
  .map(([key]) => key);

if (missingConfig.length > 0) {
  console.error(
    [
      'Expo E2E export is missing its compiled Privy placeholder config.',
      `Missing: ${missingConfig.join(', ')}`,
      'Keep the E2E export cache-cleared so an earlier env-less web build cannot poison Metro output.',
    ].join('\n'),
  );
  process.exit(1);
}

console.log('Verified compiled E2E Privy config in the Expo web bundles.');
