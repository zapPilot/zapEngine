import { describe, expect, it } from 'vitest';

import { buildMainEnvSource } from '../src/main/config';

const DEFAULTS = {
  VITE_ACCOUNT_API_URL: 'https://account.prod.example',
  VITE_ANALYTICS_ENGINE_URL: 'https://analytics.prod.example',
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

  it('ZAP_* env wins over config file and defaults', () => {
    const source = buildMainEnvSource({
      env: { ZAP_ANALYTICS_ENGINE_URL: 'http://localhost:8001' },
      configFile: { VITE_ANALYTICS_ENGINE_URL: 'https://analytics.override' },
      defaults: DEFAULTS,
      isPackaged: false,
    });
    expect(source['VITE_ANALYTICS_ENGINE_URL']).toBe('http://localhost:8001');
    expect(source['MODE']).toBe('development');
  });

  it('ignores empty env values', () => {
    const source = buildMainEnvSource({
      env: { ZAP_ANALYTICS_ENGINE_URL: '' },
      configFile: undefined,
      defaults: DEFAULTS,
      isPackaged: true,
    });
    expect(source['VITE_ANALYTICS_ENGINE_URL']).toBe(
      'https://analytics.prod.example',
    );
  });

  it('always pins VITE_APP_RUNTIME to desktop', () => {
    const source = buildMainEnvSource({
      env: {},
      configFile: { VITE_APP_RUNTIME: 'web' },
      defaults: DEFAULTS,
      isPackaged: true,
    });
    expect(source['VITE_APP_RUNTIME']).toBe('desktop');
  });
});
