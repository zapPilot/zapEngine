import { afterEach, describe, expect, it, vi } from 'vitest';

import { logSentryBootStatus } from '../src/observability/sentryBootLog';

describe('logSentryBootStatus', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs enabled status with environment and release', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    logSentryBootStatus(true, 'production', '2.1.0');

    expect(logSpy).toHaveBeenCalledOnce();
    expect(logSpy).toHaveBeenCalledWith(
      '[sentry] enabled environment=production release=2.1.0',
    );
  });

  it('logs disabled status when the DSN is missing', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    logSentryBootStatus(false, 'development', 'unknown');

    expect(logSpy).toHaveBeenCalledOnce();
    expect(logSpy).toHaveBeenCalledWith(
      '[sentry] disabled environment=development release=unknown',
    );
  });
});
