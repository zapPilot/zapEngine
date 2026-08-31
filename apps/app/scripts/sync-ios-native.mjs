#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { closeSync, mkdirSync, openSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const assertIosNativeDependencies = require('./assert-ios-native-dependencies.cjs');

const appRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const iosRoot = resolve(appRoot, 'ios');
const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

function run(command, args, cwd, logPath, extraEnv = {}) {
  let logFd;
  if (logPath) {
    mkdirSync(dirname(logPath), { recursive: true });
    logFd = openSync(logPath, 'a');
  }

  const result = spawnSync(command, args, {
    cwd,
    env: {
      ...process.env,
      ...extraEnv,
      EXPO_NO_TELEMETRY: '1',
    },
    stdio: logFd === undefined ? 'inherit' : ['ignore', logFd, logFd],
  });
  if (logFd !== undefined) closeSync(logFd);

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} exited with status ${result.status ?? 1}`,
    );
  }
}

export function syncIosNative({
  clean = process.env.ZAP_IOS_CLEAN_PREBUILD === '1',
  logPath,
  env = {},
} = {}) {
  if (process.platform !== 'darwin') {
    throw new Error('iOS native synchronization requires macOS.');
  }

  const prebuildArgs = [
    'exec',
    'expo',
    'prebuild',
    '--platform',
    'ios',
    '--no-install',
  ];
  if (!clean) prebuildArgs.push('--no-clean');

  console.log(
    clean
      ? 'Regenerating the iOS project from clean Expo config...'
      : 'Synchronizing Expo config into the existing iOS project...',
  );
  run(pnpmCommand, prebuildArgs, appRoot, logPath, env);

  console.log(
    'Installing iOS Pods from the current JavaScript dependencies...',
  );
  run('pod', ['install'], iosRoot, logPath, env);

  assertIosNativeDependencies(appRoot, {
    CONFIGURATION: 'Release',
    PLATFORM_NAME: 'iphoneos',
  });
  console.log('Verified iOS Pod locks and required cold-start native modules.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    syncIosNative();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
