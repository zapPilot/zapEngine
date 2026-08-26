import { describe, expect, it } from 'vitest';

import { buildMainEnvSource } from '../src/main/config';

const DEFAULTS = {
  VITE_ACCOUNT_API_URL: 'https://account.prod.example',
  VITE_ANALYTICS_ENGINE_URL: 'https://analytics.prod.example',
  VITE_SENTRY_DSN: '',
};

describe('buildMainEnvSource', () => {
  it('falls back to production defaults', () => {
    const source = buildMainEnvSource({
      env: {},
      configFile: undefined,
      defaults: DEFAULTS,
      isPackaged: true,
    });
    expect(source['VITE_ACCOUNT_API_URL']).toBe('https://account.prod.example');
    expect(source['VITE_ANALYTICS_ENGINE_URL']).toBe(
      'https://analytics.prod.example',
    );
    expect(source['MODE']).toBe('production');
    expect(source['VITE_APP_RUNTIME']).toBe('desktop');
  });

  it('userData config.json overrides defaults', () => {
    const source = buildMainEnvSource({
      env: {},
      configFile: { VITE_ANALYTICS_ENGINE_URL: 'https://analytics.override' },
      defaults: DEFAULTS,
      isPackaged: true,
    });
    expect(source['VITE_ANALYTICS_ENGINE_URL']).toBe(
      'https://analytics.override',
    );
    expect(source['VITE_ACCOUNT_API_URL']).toBe('https://account.prod.example');
  });

  it('canonical env wins over config file and defaults', () => {
    const source = buildMainEnvSource({
      env: { ANALYTICS_ENGINE_URL: 'http://localhost:8001' },
      configFile: { VITE_ANALYTICS_ENGINE_URL: 'https://analytics.override' },
      defaults: DEFAULTS,
      isPackaged: false,
    });
    expect(source['VITE_ANALYTICS_ENGINE_URL']).toBe('http://localhost:8001');
  });

  it('uses a canonical process value without config aliases', () => {
    const source = buildMainEnvSource({
      env: { ANALYTICS_ENGINE_URL: 'http://localhost:9001' },
      configFile: { VITE_ANALYTICS_ENGINE_URL: 'https://analytics.override' },
      defaults: DEFAULTS,
      isPackaged: false,
    });
    expect(source['VITE_ANALYTICS_ENGINE_URL']).toBe('http://localhost:9001');
    expect(source['MODE']).toBe('development');
  });

  it('projects the canonical desktop Sentry DSN for app-core consumers', () => {
    const source = buildMainEnvSource({
      env: { SENTRY_DESKTOP_DSN: 'https://public@sentry.example/1' },
      defaults: DEFAULTS,
      isPackaged: true,
    });
    expect(source['VITE_SENTRY_DSN']).toBe('https://public@sentry.example/1');
  });

  it('ignores empty canonical env values', () => {
    const source = buildMainEnvSource({
      env: {
        ANALYTICS_ENGINE_URL: '',
      },
      configFile: undefined,
      defaults: DEFAULTS,
      isPackaged: true,
    });
    expect(source['VITE_ANALYTICS_ENGINE_URL']).toBe(
      'https://analytics.prod.example',
    );
  });

  it('always pins VITE_APP_RUNTIME and MODE', () => {
    const source = buildMainEnvSource({
      env: { VITE_APP_RUNTIME: 'web', MODE: 'test' },
      configFile: { VITE_APP_RUNTIME: 'app', MODE: 'staging' },
      defaults: DEFAULTS,
      isPackaged: true,
    });
    expect(source['VITE_APP_RUNTIME']).toBe('desktop');
    expect(source['MODE']).toBe('production');
  });

  it('does not copy unrelated canonical env values', () => {
    const source = buildMainEnvSource({
      env: { PODCAST_API_URL: 'http://localhost:3000' },
      defaults: DEFAULTS,
      isPackaged: false,
    });
    expect(source).not.toHaveProperty('VITE_PODCAST_API_URL');
  });
});
