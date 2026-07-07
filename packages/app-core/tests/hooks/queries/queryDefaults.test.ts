import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

async function importQueryDefaults() {
  return import('@core/hooks/queries/queryDefaults');
}

describe('createQueryConfig cache timing', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.resetModules();
    delete process.env['VITE_CACHE_MAX_AGE_SECONDS'];
    delete process.env['VITE_CACHE_STALE_WHILE_REVALIDATE_SECONDS'];
  });

  it('aligns default query timing with cache env injected before first import', async () => {
    const { configureAppCoreEnv } = await import('@core/lib/env/runtimeEnv');
    configureAppCoreEnv({
      VITE_CACHE_MAX_AGE_SECONDS: '7',
      VITE_CACHE_STALE_WHILE_REVALIDATE_SECONDS: '11',
    });

    const { createQueryConfig } = await importQueryDefaults();

    expect(createQueryConfig()).toMatchObject({
      staleTime: 7_000,
      gcTime: 18_000,
    });
  });
});
