import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  contentLanguageBadge,
  isContentLanguageCode,
} from '@/config/contentLanguages';

afterEach(() => {
  vi.doUnmock('@/config/appRuntime');
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('configuration coverage', () => {
  it('uses web-specific Privy configuration before the public fallback', async () => {
    vi.doMock('@/config/appRuntime', () => ({ APP_RUNTIME: 'web' }));
    vi.stubEnv('EXPO_PUBLIC_PRIVY_APP_ID', 'public-app');

    const { buildAppCoreEnvSource } = await import('@/config/appCoreEnv');

    expect(
      buildAppCoreEnvSource({ privyWebAppId: 'web-app' }).VITE_PRIVY_APP_ID,
    ).toBe('web-app');
    expect(buildAppCoreEnvSource().VITE_PRIVY_APP_ID).toBe('public-app');
  });

  it('validates known languages and derives a badge for unknown languages', () => {
    expect(isContentLanguageCode('en')).toBe(true);
    expect(isContentLanguageCode('fr')).toBe(false);
    expect(contentLanguageBadge('en')).toBe('EN');
    expect(contentLanguageBadge('french')).toBe('FR');
  });

  it('loads the native extension-error no-op module', async () => {
    await expect(
      import('@/config/ignoreExtensionErrors'),
    ).resolves.toBeDefined();
  });

  it('installs the browser extension filters during development startup', async () => {
    const addEventListener = vi.fn();
    vi.stubGlobal('__DEV__', true);
    vi.stubGlobal('window', { addEventListener });

    await import('@/config/ignoreExtensionErrors.web');

    expect(addEventListener).toHaveBeenCalledTimes(2);
    expect(addEventListener.mock.calls.map(([type]) => type)).toEqual([
      'error',
      'unhandledrejection',
    ]);
  });
});
