#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  loadIosArchiveEnv,
  writeIosArchiveXcodeEnv,
} from './ios-archive-env.mjs';
import { syncIosNative } from './sync-ios-native.mjs';

const appRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const repoRoot = resolve(appRoot, '..', '..');
const workspacePath = resolve(appRoot, 'ios', 'ZapPilot.xcworkspace');
const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

function run(command, args, cwd, env = {}) {
  const result = spawnSync(command, args, {
    cwd,
    env: { ...process.env, ...env },
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

  // Local Xcode archives are production artifacts. Resolve the same canonical
  // prod environment that env:sync projects to EAS, then project only Expo
  // client values into the native build. Missing required mobile Privy config
  // fails here, before Xcode can create an installable-but-broken archive.
  const archiveEnv = loadIosArchiveEnv();

  run(
    pnpmCommand,
    ['turbo', 'run', 'build', '--filter=@zapengine/app-core'],
    repoRoot,
    archiveEnv,
  );
  syncIosNative({ env: archiveEnv });
  const xcodeEnvPath = writeIosArchiveXcodeEnv(appRoot, archiveEnv);

  run('open', [workspacePath], appRoot, archiveEnv);
  console.log(
    `Opened the synchronized ZapPilot.xcworkspace with production Expo env in ${xcodeEnvPath}. Use Product → Archive.`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
