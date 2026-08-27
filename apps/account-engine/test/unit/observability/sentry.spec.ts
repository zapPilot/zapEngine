const sentryMocks = vi.hoisted(() => ({
  captureException: vi.fn(),
  flush: vi.fn(),
  init: vi.fn(),
  setContext: vi.fn(),
  setLevel: vi.fn(),
  setTag: vi.fn(),
}));

vi.mock('@sentry/node', () => ({
  captureException: sentryMocks.captureException,
  flush: sentryMocks.flush,
  init: sentryMocks.init,
  withScope: vi.fn(
    (
      callback: (scope: {
        setContext: typeof sentryMocks.setContext;
        setLevel: typeof sentryMocks.setLevel;
        setTag: typeof sentryMocks.setTag;
      }) => void,
    ) =>
      callback({
        setContext: sentryMocks.setContext,
        setLevel: sentryMocks.setLevel,
        setTag: sentryMocks.setTag,
      }),
  ),
}));

import {
  captureBackgroundException,
  captureServerException,
  flushSentry,
  initSentry,
} from '../../../src/observability/sentry';

describe('Sentry observability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('is a no-op when SENTRY_ACCOUNT_ENGINE_DSN is unset', () => {
    expect(initSentry({ NODE_ENV: 'production' })).toBe(false);
    expect(sentryMocks.init).not.toHaveBeenCalled();
  });

  it('is a no-op when SENTRY_ACCOUNT_ENGINE_DSN is blank', () => {
    expect(
      initSentry({
        NODE_ENV: 'production',
        SENTRY_ACCOUNT_ENGINE_DSN: '   ',
      }),
    ).toBe(false);
    expect(sentryMocks.init).not.toHaveBeenCalled();
  });

  it('initializes with environment and release metadata', () => {
    expect(
      initSentry({
        APP_COMMIT_SHA: ' commit-sha ',
        NODE_ENV: ' production ',
        SENTRY_ACCOUNT_ENGINE_DSN:
          ' https://examplePublicKey@example.ingest.sentry.io/1 ',
      }),
    ).toBe(true);

    expect(sentryMocks.init).toHaveBeenCalledWith({
      dsn: 'https://examplePublicKey@example.ingest.sentry.io/1',
      environment: 'production',
      release: 'commit-sha',
      sendDefaultPii: false,
      skipOpenTelemetrySetup: true,
    });
  });

  it('leaves release undefined when APP_COMMIT_SHA is blank', () => {
    initSentry({
      APP_COMMIT_SHA: '   ',
      SENTRY_ACCOUNT_ENGINE_DSN:
        'https://examplePublicKey@example.ingest.sentry.io/1',
    });

    expect(sentryMocks.init).toHaveBeenCalledWith(
      expect.objectContaining({ release: undefined }),
    );
  });

  describe('captureBackgroundException', () => {
    it('tags the component, sets context and level, and captures the error', () => {
      const error = new Error('job boom');

      captureBackgroundException(error, {
        component: 'job',
        tags: { job_type: 'weekly_report_batch', job_status: 'failed' },
        context: { jobId: 'job-1', retryCount: 3, maxRetries: 3 },
        level: 'error',
      });

      expect(sentryMocks.setTag).toHaveBeenCalledWith('component', 'job');
      expect(sentryMocks.setTag).toHaveBeenCalledWith(
        'job_type',
        'weekly_report_batch',
      );
      expect(sentryMocks.setTag).toHaveBeenCalledWith('job_status', 'failed');
      expect(sentryMocks.setContext).toHaveBeenCalledWith('accountEngine', {
        jobId: 'job-1',
        retryCount: 3,
        maxRetries: 3,
      });
      expect(sentryMocks.setLevel).toHaveBeenCalledWith('error');
      expect(sentryMocks.captureException).toHaveBeenCalledWith(error);
    });

    it('skips undefined tag values instead of sending them as empty strings', () => {
      captureBackgroundException(new Error('boom'), {
        component: 'job',
        tags: { job_type: undefined },
      });

      expect(sentryMocks.setTag).toHaveBeenCalledWith('component', 'job');
      expect(sentryMocks.setTag).not.toHaveBeenCalledWith(
        'job_type',
        expect.anything(),
      );
    });

    it('omits context and level when not provided', () => {
      captureBackgroundException(new Error('boom'), { component: 'job' });

      expect(sentryMocks.setContext).not.toHaveBeenCalled();
      expect(sentryMocks.setLevel).not.toHaveBeenCalled();
    });
  });

  describe('captureServerException', () => {
    it('captures an exception with the http component and request metadata tags', () => {
      const error = new Error('boom');

      captureServerException(error, {
        method: 'POST',
        route: '/users/:userId',
      });

      expect(sentryMocks.setTag).toHaveBeenCalledWith('component', 'http');
      expect(sentryMocks.setTag).toHaveBeenCalledWith('http.method', 'POST');
      expect(sentryMocks.setTag).toHaveBeenCalledWith(
        'http.route',
        '/users/:userId',
      );
      expect(sentryMocks.captureException).toHaveBeenCalledWith(error);
    });

    it('tags only the component when no request metadata is available', () => {
      captureServerException(new Error('boom'));

      expect(sentryMocks.setTag).toHaveBeenCalledWith('component', 'http');
      expect(sentryMocks.setTag).not.toHaveBeenCalledWith(
        'http.method',
        expect.anything(),
      );
      expect(sentryMocks.setTag).not.toHaveBeenCalledWith(
        'http.route',
        expect.anything(),
      );
      expect(sentryMocks.captureException).toHaveBeenCalled();
    });
  });

  describe('flushSentry', () => {
    it('resolves with the SDK flush result', async () => {
      sentryMocks.flush.mockResolvedValue(true);

      await expect(flushSentry(1_000)).resolves.toBe(true);
      expect(sentryMocks.flush).toHaveBeenCalledWith(1_000);
    });

    it('defaults the timeout to 5000ms', async () => {
      sentryMocks.flush.mockResolvedValue(true);

      await flushSentry();

      expect(sentryMocks.flush).toHaveBeenCalledWith(5_000);
    });

    it('swallows a throw and returns false', async () => {
      sentryMocks.flush.mockRejectedValue(new Error('flush failed'));

      await expect(flushSentry()).resolves.toBe(false);
    });
  });
});
