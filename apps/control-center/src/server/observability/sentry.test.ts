import { beforeEach, describe, expect, it, vi } from 'vitest';

const sentryMocks = vi.hoisted(() => ({
  captureException: vi.fn(),
  init: vi.fn(),
  setTag: vi.fn(),
}));

vi.mock('@sentry/node', () => ({
  captureException: sentryMocks.captureException,
  init: sentryMocks.init,
  withScope: vi.fn(
    (callback: (scope: { setTag: typeof sentryMocks.setTag }) => void) =>
      callback({ setTag: sentryMocks.setTag }),
  ),
}));

import { captureServerException, initSentry } from './sentry.js';

describe('control center Sentry observability', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does not initialize without a non-blank DSN', () => {
    expect(initSentry({ SENTRY_CONTROL_CENTER_DSN: ' ' })).toBe(false);
    expect(sentryMocks.init).not.toHaveBeenCalled();
  });

  it('initializes error-only reporting', () => {
    initSentry({
      APP_COMMIT_SHA: 'sha',
      NODE_ENV: 'production',
      SENTRY_CONTROL_CENTER_DSN: 'https://example.test/3',
    });
    expect(sentryMocks.init).toHaveBeenCalledWith({
      dsn: 'https://example.test/3',
      environment: 'production',
      release: 'sha',
      sendDefaultPii: false,
      skipOpenTelemetrySetup: true,
    });
  });

  it('captures request template metadata', () => {
    const error = new Error('boom');
    captureServerException(error, { method: 'GET', route: '/api/overview' });
    expect(sentryMocks.setTag).toHaveBeenCalledWith('http.method', 'GET');
    expect(sentryMocks.setTag).toHaveBeenCalledWith(
      'http.route',
      '/api/overview',
    );
    expect(sentryMocks.captureException).toHaveBeenCalledWith(error);
  });
});
