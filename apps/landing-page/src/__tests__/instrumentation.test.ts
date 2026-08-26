import { beforeEach, describe, expect, it, vi } from 'vitest';

const sentryMocks = vi.hoisted(() => ({ captureRequestError: vi.fn() }));

vi.mock('@sentry/nextjs', () => ({
  captureRequestError: sentryMocks.captureRequestError,
}));

describe('Next.js server instrumentation', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('NEXT_RUNTIME', 'test');
  });

  it('exports the Sentry request error hook', async () => {
    const instrumentation = await import('../instrumentation');
    expect(instrumentation.onRequestError).toBe(
      sentryMocks.captureRequestError,
    );
    await expect(instrumentation.register()).resolves.toBeUndefined();
  });
});
