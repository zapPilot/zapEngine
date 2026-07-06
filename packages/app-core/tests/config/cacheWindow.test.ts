import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Fresh module per test: CACHE_WINDOW memoizes its env reads on first touch.
async function loadCacheWindow() {
  return import('@core/config/cacheWindow');
}

describe('CACHE_WINDOW', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    delete process.env['VITE_CACHE_MAX_AGE_SECONDS'];
    delete process.env['VITE_CACHE_STALE_WHILE_REVALIDATE_SECONDS'];
  });

  it('uses the defaults when no env is set', async () => {
    const { CACHE_WINDOW } = await loadCacheWindow();

    expect(CACHE_WINDOW.maxAgeSeconds).toBe(60 * 60);
    expect(CACHE_WINDOW.staleWhileRevalidateSeconds).toBe(23 * 60 * 60);
    expect(CACHE_WINDOW.staleTimeMs).toBe(60 * 60 * 1000);
    expect(CACHE_WINDOW.gcTimeMs).toBe(24 * 60 * 60 * 1000);
    expect(CACHE_WINDOW.headerValue).toBe(
      'public, max-age=3600, stale-while-revalidate=82800',
    );
  });

  it('reads process.env set before first touch', async () => {
    process.env['VITE_CACHE_MAX_AGE_SECONDS'] = '120';
    process.env['VITE_CACHE_STALE_WHILE_REVALIDATE_SECONDS'] = '240';

    const { CACHE_WINDOW } = await loadCacheWindow();

    expect(CACHE_WINDOW.maxAgeSeconds).toBe(120);
    expect(CACHE_WINDOW.staleWhileRevalidateSeconds).toBe(240);
    expect(CACHE_WINDOW.staleTimeMs).toBe(120_000);
    expect(CACHE_WINDOW.gcTimeMs).toBe(360_000);
    expect(CACHE_WINDOW.headerValue).toBe(
      'public, max-age=120, stale-while-revalidate=240',
    );
  });

  it('falls back to defaults for malformed process.env values', async () => {
    process.env['VITE_CACHE_MAX_AGE_SECONDS'] = 'not-a-number';
    process.env['VITE_CACHE_STALE_WHILE_REVALIDATE_SECONDS'] = 'Infinity';

    const { CACHE_WINDOW } = await loadCacheWindow();

    expect(CACHE_WINDOW.maxAgeSeconds).toBe(60 * 60);
    expect(CACHE_WINDOW.staleWhileRevalidateSeconds).toBe(23 * 60 * 60);
    expect(CACHE_WINDOW.staleTimeMs).toBe(60 * 60 * 1000);
    expect(CACHE_WINDOW.gcTimeMs).toBe(24 * 60 * 60 * 1000);
    expect(CACHE_WINDOW.headerValue).toBe(
      'public, max-age=3600, stale-while-revalidate=82800',
    );
  });

  it('honors env injected via configureAppCoreEnv before first touch', async () => {
    const { configureAppCoreEnv } = await import('@core/lib/env/runtimeEnv');
    configureAppCoreEnv({
      VITE_CACHE_MAX_AGE_SECONDS: '10',
      VITE_CACHE_STALE_WHILE_REVALIDATE_SECONDS: '20',
    });

    const { CACHE_WINDOW } = await loadCacheWindow();

    expect(CACHE_WINDOW.maxAgeSeconds).toBe(10);
    expect(CACHE_WINDOW.staleWhileRevalidateSeconds).toBe(20);
    expect(CACHE_WINDOW.gcTimeMs).toBe(30_000);
  });
});
