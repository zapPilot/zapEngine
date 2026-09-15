import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DesktopSchedulerContextSync,
  useDesktopBridge,
} from '@/integration/desktopBridge';
import { OwnBundleUrlSync } from '@/integration/bundleShareUrlSync';
import { getBundleShareOrigin } from '@/integration/bundleShareOrigin';
import { InvestProvider } from '@/integration/useInvest.ios';
import { InvestExecutionProvider } from '@/integration/useInvestExecution.ios';

const UUID = '5fc63d4e-4e07-47d8-840b-ccd3420d553f';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  vi.clearAllMocks();
});

describe('native platform adapters', () => {
  it('keeps native runtime and browser-only bridges inert', async () => {
    expect((await import('@/config/appRuntime')).APP_RUNTIME).toBe('native');
    expect(useDesktopBridge()).toBeUndefined();
    expect(DesktopSchedulerContextSync()).toBeNull();
    expect(OwnBundleUrlSync()).toBeNull();
    expect(getBundleShareOrigin()).toMatch(/^https:\/\//);
  });

  it('lets both iOS provider stubs pass their children through', () => {
    const child = { marker: 'child' } as never;
    const investElement = InvestProvider({ children: child }) as ReactElement<{
      children: unknown;
    }>;
    const investExecutionElement = InvestExecutionProvider({
      children: child,
    }) as ReactElement<{ children: unknown }>;
    expect(investElement.props.children).toBe(child);
    expect(investExecutionElement.props.children).toBe(child);
  });
});

describe('web platform adapters', () => {
  it('detects plain web and Electron runtimes at module initialization', async () => {
    vi.stubGlobal('window', {});
    expect((await import('@/config/appRuntime.web')).APP_RUNTIME).toBe('web');

    vi.resetModules();
    vi.stubGlobal('window', { zapDesktop: {} });
    expect((await import('@/config/appRuntime.web')).APP_RUNTIME).toBe(
      'desktop',
    );
  });

  it('uses the live web origin and falls back during static rendering', async () => {
    vi.stubGlobal('window', { location: { origin: 'http://localhost:8081' } });
    const browserModule = await import('@/integration/bundleShareOrigin.web');
    expect(browserModule.getBundleShareOrigin()).toBe('http://localhost:8081');

    vi.stubGlobal('window', undefined);
    expect(browserModule.getBundleShareOrigin()).toMatch(/^https:\/\//);
  });

  it('defers URL latching on the server and preserves the first browser value', async () => {
    vi.stubGlobal('window', undefined);
    const module = await import('@/integration/bundleViewParam.web');
    expect(module.getBundleViewUserId()).toBeNull();

    vi.stubGlobal('window', { location: { search: `?userId=${UUID}` } });
    expect(module.getBundleViewUserId()).toBe(UUID);
    vi.stubGlobal('window', { location: { search: '' } });
    expect(module.getBundleViewUserId()).toBe(UUID);
  });
});

describe('app-core environment bootstrap', () => {
  it('projects Expo extra into app-core exactly once on import', async () => {
    const configure = vi.fn();
    const build = vi.fn(() => ({ VITE_ACCOUNT_API_URL: 'https://api' }));
    const read = vi.fn(() => ({ accountApiUrl: 'https://api' }));
    vi.doMock('@zapengine/app-core/lib/env/runtimeEnv', () => ({
      configureAppCoreEnv: configure,
    }));
    vi.doMock('@/config/appCoreEnv', () => ({ buildAppCoreEnvSource: build }));
    vi.doMock('@/config/expoRuntimeConfig', () => ({ readExpoExtra: read }));

    await import('@/config/configureAppCoreEnv');

    expect(read).toHaveBeenCalledOnce();
    expect(build).toHaveBeenCalledWith({ accountApiUrl: 'https://api' });
    expect(configure).toHaveBeenCalledWith({
      VITE_ACCOUNT_API_URL: 'https://api',
    });
  });
});
