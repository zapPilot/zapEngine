import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resolveCocoaPodsToolchainEnv } from '../scripts/sync-ios-native.mjs';

describe('CocoaPods Hermes toolchain', () => {
  let sdk: string;

  beforeEach(() => {
    sdk = mkdtempSync(join(tmpdir(), 'zap-cmake-'));
  });

  afterEach(() => rmSync(sdk, { recursive: true, force: true }));

  function install(version: string, executable = true) {
    const bin = join(sdk, 'cmake', version, 'bin');
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, 'cmake'), '#!/bin/sh\nexit 0\n');
    chmodSync(join(bin, 'cmake'), executable ? 0o755 : 0o644);
    return bin;
  }

  it('preserves an existing CMake on PATH', () => {
    const bin = install('3.22.1');
    expect(
      resolveCocoaPodsToolchainEnv({ PATH: bin, ANDROID_HOME: sdk }),
    ).toEqual({});
  });

  it('finds the newest executable SDK version without altering the rest of PATH', () => {
    install('3.9.0');
    const bin = install('3.22.1');
    install('4.0.0', false);
    expect(
      resolveCocoaPodsToolchainEnv({ PATH: '/usr/bin', ANDROID_HOME: sdk }),
    ).toEqual({ PATH: `${bin}${delimiter}/usr/bin` });
  });

  it('supports ANDROID_SDK_ROOT and an absent PATH', () => {
    const bin = install('3.22.1');
    expect(resolveCocoaPodsToolchainEnv({ ANDROID_SDK_ROOT: sdk })).toEqual({
      PATH: bin,
    });
  });

  it('leaves the environment alone when the SDK has no CMake', () => {
    expect(resolveCocoaPodsToolchainEnv({ ANDROID_HOME: sdk })).toEqual({});
    install('3.22.1', false);
    expect(resolveCocoaPodsToolchainEnv({ ANDROID_HOME: sdk })).toEqual({});
  });
});

it('excludes Skia from iOS autolinking while pinning the spike version', async () => {
  const { default: pkg } = await import('../package.json');
  expect(pkg.dependencies['@shopify/react-native-skia']).toBe('2.6.2');
  expect(pkg.expo.autolinking.ios.exclude).toContain(
    '@shopify/react-native-skia',
  );
});
