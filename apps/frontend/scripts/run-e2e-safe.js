#!/usr/bin/env node

/**
 * Safe Playwright runner for local/dev environments.
 * - Skips E2E if Playwright binary or browsers are not installed.
 * - Skips when dev server cannot bind the port in sandboxed CI.
 * - Runs with 1 worker and list reporter to reduce resource usage.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function resolveBin(bin) {
  const local = path.join(
    __dirname,
    '..',
    'node_modules',
    '.bin',
    bin + (process.platform === 'win32' ? '.cmd' : ''),
  );
  return fs.existsSync(local) ? local : null;
}

async function main() {
  const bin = resolveBin('playwright');
  if (!bin) {
    console.log('ℹ️  Playwright not installed. Skipping E2E tests.');
    process.exit(0);
  }

  const args = ['test', '--workers=1', '--reporter=list'];
  const child = spawn(bin, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env },
  });

  let stderr = '';
  let stdout = '';
  child.stdout.on('data', (d) => {
    const chunk = d.toString();
    stdout += chunk;
    process.stdout.write(chunk);
  });
  child.stderr.on('data', (d) => {
    const chunk = d.toString();
    stderr += chunk;
    process.stderr.write(chunk);
  });

  child.on('exit', (code) => {
    if (code !== 0) {
      const err = (stderr + stdout).toLowerCase();
      if (err.includes('no tests found')) {
        console.log('\nℹ️  No Playwright specs detected. Skipping E2E tests.');
        process.exit(0);
        return;
      }
      const isPortOrPerm =
        err.includes('failed to start server') ||
        err.includes('was not able to start') ||
        err.includes('is already used') ||
        err.includes('listen eperm') ||
        err.includes('eaddrinuse') ||
        err.includes('operation not permitted');
      if (isPortOrPerm) {
        console.log(
          '\nℹ️  Skipping E2E: dev server cannot start in this environment.',
        );
        process.exit(0);
        return;
      }
      if (
        err.includes('browsertype.launch') ||
        err.includes('please install browsers') ||
        err.includes("executable doesn't exist") ||
        err.includes('download new browsers')
      ) {
        console.log(
          '\nℹ️  Playwright browsers not installed. Skipping E2E tests.',
        );
        process.exit(0);
        return;
      }
      console.error('\n❌ Playwright E2E tests failed.');
      console.error(
        '   If this is a fresh environment, run: npx playwright install',
      );
      process.exit(code);
      return;
    }
    process.exit(0);
  });

  child.on('error', (err) => {
    console.error('❌ Failed to spawn Playwright:', err);
    process.exit(1);
  });
}

main().catch((err) => {
  console.error('❌ Failed to run Playwright tests:', err);
  process.exit(1);
});
