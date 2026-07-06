import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type RuntimeEnvModule = typeof import('@core/lib/env/runtimeEnv');

// Fresh module per test so the module-level injected env starts unset.
async function loadRuntimeEnv(): Promise<RuntimeEnvModule> {
  return import('@core/lib/env/runtimeEnv');
}

const TEST_KEY = 'VITE_RUNTIME_ENV_TEST_KEY';

describe('runtimeEnv', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    delete process.env[TEST_KEY];
    delete process.env['VITE_APP_RUNTIME'];
  });

  describe('getRuntimeEnv', () => {
    it('prefers injected values over process.env', async () => {
      const env = await loadRuntimeEnv();
      process.env[TEST_KEY] = 'from_process';

      env.configureAppCoreEnv({ [TEST_KEY]: 'from_injected' });

      expect(env.getRuntimeEnv(TEST_KEY)).toBe('from_injected');
    });

    it('falls back to process.env when no env was injected', async () => {
      const env = await loadRuntimeEnv();
      process.env[TEST_KEY] = 'from_process';

      expect(env.getRuntimeEnv(TEST_KEY)).toBe('from_process');
    });

    it('falls back to process.env when the injected value is not a string', async () => {
      const env = await loadRuntimeEnv();
      process.env[TEST_KEY] = 'from_process';

      env.configureAppCoreEnv({ [TEST_KEY]: true });

      expect(env.getRuntimeEnv(TEST_KEY)).toBe('from_process');
    });

    it('returns undefined when the key is absent everywhere', async () => {
      const env = await loadRuntimeEnv();

      env.configureAppCoreEnv({});

      expect(env.getRuntimeEnv(TEST_KEY)).toBeUndefined();
    });

    it('lets a later configureAppCoreEnv call replace the injected map', async () => {
      const env = await loadRuntimeEnv();

      env.configureAppCoreEnv({ [TEST_KEY]: 'first' });
      env.configureAppCoreEnv({ [TEST_KEY]: 'second' });

      expect(env.getRuntimeEnv(TEST_KEY)).toBe('second');
    });
  });

  describe('isRuntimeMode', () => {
    it('prefers process.env NODE_ENV over injected MODE', async () => {
      const env = await loadRuntimeEnv();

      env.configureAppCoreEnv({ MODE: 'production' });

      // Vitest sets NODE_ENV=test
      expect(env.isRuntimeMode('test')).toBe(true);
      expect(env.isRuntimeMode('production')).toBe(false);
    });

    it('uses injected MODE when NODE_ENV is empty', async () => {
      const env = await loadRuntimeEnv();
      const originalNodeEnv = process.env['NODE_ENV'];
      process.env['NODE_ENV'] = '';

      try {
        env.configureAppCoreEnv({ MODE: 'production' });

        expect(env.isRuntimeMode('production')).toBe(true);
      } finally {
        if (originalNodeEnv !== undefined) {
          process.env['NODE_ENV'] = originalNodeEnv;
        } else {
          delete process.env['NODE_ENV'];
        }
      }
    });
  });

  describe('getAppRuntime', () => {
    it('accepts native from the injected env', async () => {
      const env = await loadRuntimeEnv();

      env.configureAppCoreEnv({ VITE_APP_RUNTIME: 'native' });

      expect(env.getAppRuntime()).toBe('native');
      expect(env.isDesktopRuntime()).toBe(false);
    });

    it('accepts native from process.env', async () => {
      const env = await loadRuntimeEnv();
      process.env['VITE_APP_RUNTIME'] = 'native';

      expect(env.getAppRuntime()).toBe('native');
    });

    it('falls back to web for unknown runtimes', async () => {
      const env = await loadRuntimeEnv();

      env.configureAppCoreEnv({ VITE_APP_RUNTIME: 'embedded' });

      expect(env.getAppRuntime()).toBe('web');
      expect(env.isDesktopRuntime()).toBe(false);
    });
  });

  describe('toSeconds', () => {
    it('falls back for missing or non-finite values while preserving finite numbers', async () => {
      const env = await loadRuntimeEnv();

      expect(env.toSeconds(undefined, 60)).toBe(60);
      expect(env.toSeconds('', 60)).toBe(60);
      expect(env.toSeconds('Infinity', 60)).toBe(60);
      expect(env.toSeconds('0', 60)).toBe(0);
      expect(env.toSeconds('12.5', 60)).toBe(12.5);
    });
  });
});
