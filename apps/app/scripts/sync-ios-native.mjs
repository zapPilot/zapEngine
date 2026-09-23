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
const UTF8_LOCALE = 'en_US.UTF-8';

function firstConfiguredLocale(...values) {
  return values.find((value) => value?.trim());
}

// CocoaPods runs the installation root through `String#unicode_normalize`, which
// raises `Encoding::CompatibilityError` when Ruby's default external encoding is
// ASCII-8BIT. That encoding comes from the locale, so `pod install` aborts on any
// shell without a UTF-8 locale exported. Only the character-type locale matters,
// and LC_ALL wins over LC_CTYPE, which wins over LANG.
export function resolveCocoaPodsLocaleEnv(env) {
  const configured = firstConfiguredLocale(env.LC_ALL, env.LC_CTYPE, env.LANG);
  if (/\.utf-?8$/iu.test(configured ?? '')) return {};
  // LC_ALL is set alongside LANG so an inherited non-UTF-8 LC_CTYPE cannot win.
  return { LANG: UTF8_LOCALE, LC_ALL: UTF8_LOCALE };
}

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
  const inheritedPodEnv = { ...process.env, ...env };
  run('pod', ['install'], iosRoot, logPath, {
    ...env,
    ...resolveCocoaPodsLocaleEnv(inheritedPodEnv),
  });

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
