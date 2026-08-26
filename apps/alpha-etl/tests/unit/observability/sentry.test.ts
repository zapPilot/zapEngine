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

import {
  captureServerException,
  initSentry,
} from '../../../src/observability/sentry.js';

describe('alpha ETL Sentry observability', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does not initialize without a non-blank DSN', () => {
    expect(initSentry({ SENTRY_ALPHA_ETL_DSN: '   ' })).toBe(false);
    expect(sentryMocks.init).not.toHaveBeenCalled();
  });

  it('initializes error-only reporting with release metadata', () => {
    expect(
      initSentry({
        APP_COMMIT_SHA: ' sha ',
        NODE_ENV: ' production ',
        SENTRY_ALPHA_ETL_DSN: ' https://example.test/1 ',
      }),
    ).toBe(true);
    expect(sentryMocks.init).toHaveBeenCalledWith({
      dsn: 'https://example.test/1',
      environment: 'production',
      release: 'sha',
      sendDefaultPii: false,
      skipOpenTelemetrySetup: true,
    });
  });

  it('captures request template metadata', () => {
    const error = new Error('boom');
    captureServerException(error, { method: 'POST', route: '/webhooks/:id' });
    expect(sentryMocks.setTag).toHaveBeenCalledWith('http.method', 'POST');
    expect(sentryMocks.setTag).toHaveBeenCalledWith(
      'http.route',
      '/webhooks/:id',
    );
    expect(sentryMocks.captureException).toHaveBeenCalledWith(error);
  });
});
