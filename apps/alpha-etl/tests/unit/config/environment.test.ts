import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const baseEnv = {
  DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
  ALPHA_ETL_PORT: '4000',
  PORT: '8001',
  NODE_ENV: 'test',
  WEBHOOK_SECRET: 'secret',
  DEFILLAMA_API_URL: 'https://api.llama.fi',
  DEFI_API_URL: 'https://api.de.fi',
  HYPERLIQUID_API_URL: 'https://api-ui.hyperliquid.xyz',
  HYPERLIQUID_RATE_LIMIT_RPM: '120',
  RATE_LIMIT_REQUESTS_PER_MINUTE: '100',
  RATE_LIMIT_BURST: '20',
  LOG_LEVEL: 'debug',
};

const originalEnv = { ...process.env };

const setEnv = (values: Record<string, string | undefined>): void => {
  vi.resetModules();
  process.env = {} as NodeJS.ProcessEnv;
  Object.assign(process.env, values);
};

function createExitSpy() {
  return vi
    .spyOn(process, 'exit')
    .mockImplementation((code?: string | number | null): never => {
      throw new Error(`exit:${code}`);
    });
}

describe('environment configuration', () => {
  beforeEach(() => {
    setEnv(baseEnv);
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('parses environment variables and applies defaults', async () => {
    // Omit DB_SCHEMA to exercise default value
    delete process.env.DB_SCHEMA;

    const { env } = await import('../../../src/config/environment.js');

    expect(env.DATABASE_URL).toBe(baseEnv.DATABASE_URL);
    expect(env.DB_SCHEMA).toBe('alpha_raw');
    expect(env.PORT).toBe(4000);
    expect(env.ALPHA_ETL_PORT).toBe(4000);
    expect(env.NODE_ENV).toBe('test');
    expect(env.RATE_LIMIT_REQUESTS_PER_MINUTE).toBe(100);
    expect(env.RATE_LIMIT_BURST).toBe(20);
    expect(env.HYPERLIQUID_RATE_LIMIT_RPM).toBe(120);
    expect(env.LOG_LEVEL).toBe('debug');
  });

  it('exits the process when validation fails', async () => {
    const exitSpy = createExitSpy();
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const brokenEnv = { ...baseEnv, DATABASE_URL: '' };
    setEnv(brokenEnv);

    await expect(import('../../../src/config/environment.js')).rejects.toThrow(
      'exit:1',
    );

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('falls back to generic PORT when ALPHA_ETL_PORT is absent', async () => {
    const fallbackEnv = { ...baseEnv };
    delete fallbackEnv.ALPHA_ETL_PORT;
    fallbackEnv.PORT = '3003';
    setEnv(fallbackEnv);

    const { env } = await import('../../../src/config/environment.js');

    expect(env.PORT).toBe(3003);
  });
});
