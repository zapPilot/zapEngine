import { afterEach, describe, expect, it, vi } from 'vitest';

describe('sentry-init coverage', () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it('logs an enabled line when a DSN is present', async () => {
    vi.stubEnv('SENTRY_PODCAST_PIPELINE_DSN', 'https://example.test/2');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('APP_COMMIT_SHA', 'sha-enabled');
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      vi.resetModules();
      await import('./sentry-init.js');
      expect(log).toHaveBeenCalledWith(
        expect.stringContaining('[sentry] enabled'),
      );
      expect(log).toHaveBeenCalledWith(
        expect.stringContaining('environment=production'),
      );
      expect(log).toHaveBeenCalledWith(
        expect.stringContaining('release=sha-enabled'),
      );
    } finally {
      log.mockRestore();
    }
  });

  it('logs a disabled line with unknown fallbacks when env is absent', async () => {
    vi.stubEnv('SENTRY_PODCAST_PIPELINE_DSN', '');
    delete process.env['NODE_ENV'];
    delete process.env['APP_COMMIT_SHA'];
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      vi.resetModules();
      await import('./sentry-init.js');
      expect(log).toHaveBeenCalledWith(
        expect.stringContaining('[sentry] disabled'),
      );
      expect(log).toHaveBeenCalledWith(
        expect.stringContaining('environment=unknown'),
      );
      expect(log).toHaveBeenCalledWith(
        expect.stringContaining('release=unknown'),
      );
    } finally {
      log.mockRestore();
    }
  });
});
