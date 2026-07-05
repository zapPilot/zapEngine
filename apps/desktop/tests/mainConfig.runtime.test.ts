import { join } from 'node:path';

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const configMocks = vi.hoisted(() => ({
  app: {
    getPath: vi.fn(),
    isPackaged: true,
  },
  configureAppCoreEnv: vi.fn(),
  readFileSync: vi.fn(),
}));

vi.mock('electron', () => ({
  app: configMocks.app,
}));

vi.mock('node:fs', () => ({
  readFileSync: configMocks.readFileSync,
}));

vi.mock('@zapengine/app-core/lib/env/runtimeEnv', () => ({
  configureAppCoreEnv: configMocks.configureAppCoreEnv,
}));

import { configureMainAppCoreEnv } from '../src/main/config';

const USER_DATA_PATH = '/Users/test/Library/Application Support/ZapPilot';
const ORIGINAL_ZAP_ACCOUNT_API_URL = process.env['ZAP_ACCOUNT_API_URL'];
const ORIGINAL_ZAP_ANALYTICS_ENGINE_URL =
  process.env['ZAP_ANALYTICS_ENGINE_URL'];

function restoreEnvValue(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
}

describe('configureMainAppCoreEnv', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configMocks.app.getPath.mockReturnValue(USER_DATA_PATH);
    configMocks.app.isPackaged = true;
    delete process.env['ZAP_ACCOUNT_API_URL'];
    delete process.env['ZAP_ANALYTICS_ENGINE_URL'];
  });

  afterAll(() => {
    restoreEnvValue('ZAP_ACCOUNT_API_URL', ORIGINAL_ZAP_ACCOUNT_API_URL);
    restoreEnvValue(
      'ZAP_ANALYTICS_ENGINE_URL',
      ORIGINAL_ZAP_ANALYTICS_ENGINE_URL,
    );
  });

  it('injects user config values into app-core env', () => {
    configMocks.readFileSync.mockReturnValue(
      JSON.stringify({
        VITE_ACCOUNT_API_URL: 'https://account.override',
        VITE_ANALYTICS_ENGINE_URL: 'https://analytics.override',
      }),
    );

    configureMainAppCoreEnv();

    expect(configMocks.readFileSync).toHaveBeenCalledWith(
      join(USER_DATA_PATH, 'config.json'),
      'utf8',
    );
    expect(configMocks.configureAppCoreEnv).toHaveBeenCalledWith(
      expect.objectContaining({
        MODE: 'production',
        VITE_ACCOUNT_API_URL: 'https://account.override',
        VITE_ANALYTICS_ENGINE_URL: 'https://analytics.override',
        VITE_APP_RUNTIME: 'desktop',
      }),
    );
  });

  it('ignores non-object JSON config and uses development mode when unpackaged', () => {
    configMocks.app.isPackaged = false;
    configMocks.readFileSync.mockReturnValue('"not-an-object"');

    configureMainAppCoreEnv();

    expect(configMocks.configureAppCoreEnv).toHaveBeenCalledWith(
      expect.objectContaining({
        MODE: 'development',
        VITE_ACCOUNT_API_URL: '',
        VITE_ANALYTICS_ENGINE_URL: '',
        VITE_APP_RUNTIME: 'desktop',
      }),
    );
  });

  it('uses defaults when config JSON cannot be parsed', () => {
    configMocks.readFileSync.mockReturnValue('{');

    configureMainAppCoreEnv();

    expect(configMocks.configureAppCoreEnv).toHaveBeenCalledWith(
      expect.objectContaining({
        MODE: 'production',
        VITE_ACCOUNT_API_URL: '',
        VITE_ANALYTICS_ENGINE_URL: '',
        VITE_APP_RUNTIME: 'desktop',
      }),
    );
  });

  it('uses defaults when config file cannot be read', () => {
    configMocks.readFileSync.mockImplementation(() => {
      throw new Error('missing config');
    });

    configureMainAppCoreEnv();

    expect(configMocks.configureAppCoreEnv).toHaveBeenCalledWith(
      expect.objectContaining({
        MODE: 'production',
        VITE_ACCOUNT_API_URL: '',
        VITE_ANALYTICS_ENGINE_URL: '',
        VITE_APP_RUNTIME: 'desktop',
      }),
    );
  });
});
