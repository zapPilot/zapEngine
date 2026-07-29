import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const assertIosNativeDependencies =
  require('../scripts/assert-ios-native-dependencies.cjs') as (
    appRoot: string,
    env?: Record<string, string | undefined>,
  ) => void;

const releaseEnvironment = {
  CONFIGURATION: 'Release',
  PLATFORM_NAME: 'iphoneos',
};
const matchingLock = [
  'PODS:',
  '  - RNCAsyncStorage (2.2.0):',
  '    - React-Core',
  '',
].join('\n');

describe('iOS native dependency Release guard', () => {
  let appRoot: string;

  beforeEach(() => {
    appRoot = mkdtempSync(join(tmpdir(), 'zap-ios-native-guard-'));
    const packageRoot = join(
      appRoot,
      'node_modules',
      '@react-native-async-storage',
      'async-storage',
    );
    mkdirSync(packageRoot, { recursive: true });
    mkdirSync(join(appRoot, 'ios', 'Pods'), { recursive: true });
    writeFileSync(
      join(packageRoot, 'package.json'),
      JSON.stringify({ version: '2.2.0' }),
    );
  });

  afterEach(() => {
    rmSync(appRoot, { recursive: true, force: true });
  });

  function writeLocks(podfileLock: string, manifestLock = podfileLock): void {
    writeFileSync(join(appRoot, 'ios', 'Podfile.lock'), podfileLock);
    writeFileSync(join(appRoot, 'ios', 'Pods', 'Manifest.lock'), manifestLock);
  }

  it('does nothing for non-Xcode and non-Release Metro entry points', () => {
    expect(() => assertIosNativeDependencies(appRoot, {})).not.toThrow();
    expect(() =>
      assertIosNativeDependencies(appRoot, {
        CONFIGURATION: 'Debug',
        PLATFORM_NAME: 'iphonesimulator',
      }),
    ).not.toThrow();
  });

  it('accepts matching package, Pod, and installed manifest versions', () => {
    writeLocks(matchingLock);

    expect(() =>
      assertIosNativeDependencies(appRoot, releaseEnvironment),
    ).not.toThrow();
  });

  it('blocks the exact missing native module that crashed TestFlight', () => {
    writeLocks('PODS:\n  - React-Core (0.86.0):\n');

    expect(() =>
      assertIosNativeDependencies(appRoot, releaseEnvironment),
    ).toThrow(/has no RNCAsyncStorage Pod/u);
  });

  it('blocks a package-to-Pod version mismatch', () => {
    writeLocks(matchingLock.replace('2.2.0', '2.1.0'));

    expect(() =>
      assertIosNativeDependencies(appRoot, releaseEnvironment),
    ).toThrow(/RNCAsyncStorage@2\.1\.0/u);
  });

  it('blocks Podfile.lock and installed Manifest.lock drift', () => {
    writeLocks(matchingLock, `${matchingLock}# stale install\n`);

    expect(() =>
      assertIosNativeDependencies(appRoot, releaseEnvironment),
    ).toThrow(/Podfile\.lock does not match ios\/Pods\/Manifest\.lock/u);
  });
});
