import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const posthogMocks = vi.hoisted(() => ({
  init: vi.fn(),
  register: vi.fn(),
}));
const sentryMocks = vi.hoisted(() => ({ init: vi.fn() }));

vi.mock('@sentry/nextjs', () => ({ init: sentryMocks.init }));

vi.mock('posthog-js', () => ({
  default: { init: posthogMocks.init, register: posthogMocks.register },
}));

describe('PostHog client instrumentation', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', undefined);
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_HOST', undefined);
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('does not initialize without a project key', async () => {
    await import('../instrumentation-client');

    expect(posthogMocks.init).not.toHaveBeenCalled();
    expect(sentryMocks.init).not.toHaveBeenCalled();
  });

  it('initializes error-only Sentry reporting when configured', async () => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', ' https://example.test/5 ');

    await import('../instrumentation-client');

    expect(sentryMocks.init).toHaveBeenCalledWith({
      dsn: 'https://example.test/5',
      release: undefined,
      sendDefaultPii: false,
    });
  });

  it('logs one boot line reporting whether Sentry is enabled', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', 'https://example.test/5');
    vi.stubEnv('NODE_ENV', 'test');

    await import('../instrumentation-client');

    expect(logSpy).toHaveBeenCalledWith(
      '[sentry] enabled environment=test release=unknown',
    );
    logSpy.mockRestore();
  });

  it('logs disabled in the boot line when no DSN is configured', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await import('../instrumentation-client');

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringMatching(/^\[sentry\] disabled environment=/),
    );
    logSpy.mockRestore();
  });

  it('tracks client-side navigations and keeps replay off', async () => {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', 'phc_test');

    await import('../instrumentation-client');

    expect(posthogMocks.init).toHaveBeenCalledWith(
      'phc_test',
      expect.objectContaining({
        capture_pageview: 'history_change',
        disable_session_recording: true,
        respect_dnt: true,
      }),
    );
  });

  it('leaves anonymous marketing visitors without a person profile', async () => {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', 'phc_test');

    await import('../instrumentation-client');

    expect(posthogMocks.init.mock.calls[0]?.[1]).toMatchObject({
      person_profiles: 'identified_only',
    });
  });

  it('stamps every event with the surface that produced it', async () => {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', 'phc_test');

    await import('../instrumentation-client');

    expect(posthogMocks.register).toHaveBeenCalledWith({ surface: 'landing' });
  });

  it('leaves the ingest host to the SDK default when none is configured', async () => {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', 'phc_test');

    await import('../instrumentation-client');

    expect(posthogMocks.init.mock.calls[0]?.[1]).not.toHaveProperty('api_host');
  });

  it('uses the configured ingest host when one is provided', async () => {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', 'phc_test');
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_HOST', 'https://eu.i.posthog.com');

    await import('../instrumentation-client');

    expect(posthogMocks.init).toHaveBeenCalledWith(
      'phc_test',
      expect.objectContaining({ api_host: 'https://eu.i.posthog.com' }),
    );
  });
});
