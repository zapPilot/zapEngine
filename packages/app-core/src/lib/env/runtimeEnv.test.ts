import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  configureAppCoreEnv,
  getAppRuntime,
  getRuntimeEnv,
  isDesktopRuntime,
  isRuntimeMode,
  toSeconds,
} from './runtimeEnv';

describe('runtimeEnv', () => {
  afterEach(() => {
    configureAppCoreEnv({});
    vi.unstubAllEnvs();
  });

  it('prefers injected string env values over process env values', () => {
    vi.stubEnv('VITE_ACCOUNT_API_URL', 'https://process.example');

    configureAppCoreEnv({
      VITE_ACCOUNT_API_URL: 'https://injected.example',
    });

    expect(getRuntimeEnv('VITE_ACCOUNT_API_URL')).toBe(
      'https://injected.example',
    );
  });

  it('ignores non-string injected values and falls back to process env', () => {
    vi.stubEnv('VITE_ACCOUNT_API_URL', 'https://process.example');

    configureAppCoreEnv({
      VITE_ACCOUNT_API_URL: true,
    });

    expect(getRuntimeEnv('VITE_ACCOUNT_API_URL')).toBe(
      'https://process.example',
    );
  });

  it('resolves runtime mode from NODE_ENV before injected MODE', () => {
    vi.stubEnv('NODE_ENV', 'test');

    configureAppCoreEnv({
      MODE: 'production',
    });

    expect(isRuntimeMode('test')).toBe(true);
    expect(isRuntimeMode('production')).toBe(false);
  });

  it('falls back to web runtime for missing or unsupported runtime values', () => {
    configureAppCoreEnv({
      VITE_APP_RUNTIME: 'unsupported',
    });

    expect(getAppRuntime()).toBe('web');
    expect(isDesktopRuntime()).toBe(false);
  });

  it('detects desktop runtime from injected app runtime', () => {
    configureAppCoreEnv({
      VITE_APP_RUNTIME: 'desktop',
    });

    expect(getAppRuntime()).toBe('desktop');
    expect(isDesktopRuntime()).toBe(true);
  });

  it('uses fallback seconds for missing, malformed, or non-finite values', () => {
    expect(toSeconds(undefined, 60)).toBe(60);
    expect(toSeconds('not-a-number', 60)).toBe(60);
    expect(toSeconds('Infinity', 60)).toBe(60);
    expect(toSeconds('30', 60)).toBe(30);
  });
});
