import { beforeEach, describe, expect, it, vi } from 'vitest';

const sentryMocks = vi.hoisted(() => ({ captureRequestError: vi.fn() }));

vi.mock('@sentry/nextjs', () => ({
  captureRequestError: sentryMocks.captureRequestError,
}));
vi.mock('../../sentry.server.config', () => ({}));
vi.mock('../../sentry.edge.config', () => ({}));

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

  it.each(['nodejs', 'edge'] as const)(
    'loads the %s runtime instrumentation',
    async (runtime) => {
      vi.stubEnv('NEXT_RUNTIME', runtime);
      const instrumentation = await import('../instrumentation');
      await expect(instrumentation.register()).resolves.toBeUndefined();
    },
  );
});
