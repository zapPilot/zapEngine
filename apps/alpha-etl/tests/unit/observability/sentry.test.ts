import { beforeEach, describe, expect, it, vi } from 'vitest';

const sentryMocks = vi.hoisted(() => ({
  captureException: vi.fn(),
  init: vi.fn(),
  flush: vi.fn(),
  setTag: vi.fn(),
  setContext: vi.fn(),
  setLevel: vi.fn(),
}));

vi.mock('@sentry/node', () => ({
  captureException: sentryMocks.captureException,
  init: sentryMocks.init,
  flush: sentryMocks.flush,
  withScope: vi.fn(
    (
      callback: (scope: {
        setTag: typeof sentryMocks.setTag;
        setContext: typeof sentryMocks.setContext;
        setLevel: typeof sentryMocks.setLevel;
      }) => void,
    ) =>
      callback({
        setTag: sentryMocks.setTag,
        setContext: sentryMocks.setContext,
        setLevel: sentryMocks.setLevel,
      }),
  ),
}));

import {
  captureBackgroundException,
  captureServerException,
  flushSentry,
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
    expect(sentryMocks.setTag).toHaveBeenCalledWith('component', 'http');
    expect(sentryMocks.setTag).toHaveBeenCalledWith('http.method', 'POST');
    expect(sentryMocks.setTag).toHaveBeenCalledWith(
      'http.route',
      '/webhooks/:id',
    );
    expect(sentryMocks.captureException).toHaveBeenCalledWith(error);
  });

  describe('captureBackgroundException', () => {
    it('tags the component and skips undefined tag values', () => {
      const error = new Error('job boom');
      captureBackgroundException(error, {
        component: 'job',
        tags: { job_status: 'failed', reason: undefined },
      });

      expect(sentryMocks.setTag).toHaveBeenCalledWith('component', 'job');
      expect(sentryMocks.setTag).toHaveBeenCalledWith('job_status', 'failed');
      expect(sentryMocks.setTag).not.toHaveBeenCalledWith('reason', undefined);
      expect(sentryMocks.captureException).toHaveBeenCalledWith(error);
    });

    it('sets a single alpha-etl context object when provided', () => {
      captureBackgroundException(new Error('db-health boom'), {
        component: 'db-health',
        context: { consecutiveFailures: 1 },
      });

      expect(sentryMocks.setContext).toHaveBeenCalledWith('alpha-etl', {
        consecutiveFailures: 1,
      });
    });

    it('does not touch context or level when not provided', () => {
      captureBackgroundException(new Error('bare'), { component: 'job' });

      expect(sentryMocks.setContext).not.toHaveBeenCalled();
      expect(sentryMocks.setLevel).not.toHaveBeenCalled();
    });

    it('sets the level when provided', () => {
      captureBackgroundException(new Error('warn me'), {
        component: 'db-health',
        level: 'warning',
      });

      expect(sentryMocks.setLevel).toHaveBeenCalledWith('warning');
    });
  });

  describe('flushSentry', () => {
    it('resolves with the underlying flush result', async () => {
      sentryMocks.flush.mockResolvedValueOnce(true);

      await expect(flushSentry(1234)).resolves.toBe(true);
      expect(sentryMocks.flush).toHaveBeenCalledWith(1234);
    });

    it('swallows a throw and returns false instead of rejecting', async () => {
      sentryMocks.flush.mockRejectedValueOnce(new Error('flush exploded'));

      await expect(flushSentry()).resolves.toBe(false);
    });
  });
});
