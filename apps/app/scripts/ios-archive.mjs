#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { syncIosNative } from './sync-ios-native.mjs';

const appRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const repoRoot = resolve(appRoot, '..', '..');
const workspacePath = resolve(appRoot, 'ios', 'ZapPilot.xcworkspace');
const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    env: process.env,
    stdio: 'inherit',
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} exited with status ${result.status ?? 1}`,
    );
  }
}

try {
  if (process.platform !== 'darwin') {
    throw new Error('Opening the iOS archive workspace requires macOS.');
  }

  run(
    pnpmCommand,
    ['turbo', 'run', 'build', '--filter=@zapengine/app-core'],
    repoRoot,
  );
  syncIosNative();
  run('open', [workspacePath], appRoot);
  console.log(
    'Opened the synchronized ZapPilot.xcworkspace. Use Product → Archive.',
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
