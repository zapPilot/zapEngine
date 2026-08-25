const posthogMocks = vi.hoisted(() => ({
  init: vi.fn(),
}));

vi.mock('posthog-js', () => ({
  default: { init: posthogMocks.init },
}));

describe('PostHog client instrumentation', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env['NEXT_PUBLIC_POSTHOG_KEY'];
    delete process.env['NEXT_PUBLIC_POSTHOG_HOST'];
  });

  it('does not initialize without a project key', async () => {
    await import('../instrumentation-client');

    expect(posthogMocks.init).not.toHaveBeenCalled();
  });

  it('initializes with the configured project host', async () => {
    process.env['NEXT_PUBLIC_POSTHOG_KEY'] = 'phc_test';
    process.env['NEXT_PUBLIC_POSTHOG_HOST'] = 'https://eu.i.posthog.com';

    await import('../instrumentation-client');

    expect(posthogMocks.init).toHaveBeenCalledWith('phc_test', {
      api_host: 'https://eu.i.posthog.com',
      capture_pageview: true,
      capture_pageleave: true,
      autocapture: true,
    });
  });

  it('uses the US ingest host when no host override is provided', async () => {
    process.env['NEXT_PUBLIC_POSTHOG_KEY'] = 'phc_test';

    await import('../instrumentation-client');

    expect(posthogMocks.init).toHaveBeenCalledWith(
      'phc_test',
      expect.objectContaining({ api_host: 'https://us.i.posthog.com' }),
    );
  });
});
