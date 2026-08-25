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
} from '../../../src/observability/sentry';

describe('Sentry observability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('is a no-op when SENTRY_DSN is unset', () => {
    expect(initSentry({ NODE_ENV: 'production' })).toBe(false);
    expect(sentryMocks.init).not.toHaveBeenCalled();
  });

  it('is a no-op when SENTRY_DSN is blank', () => {
    expect(initSentry({ NODE_ENV: 'production', SENTRY_DSN: '   ' })).toBe(
      false,
    );
    expect(sentryMocks.init).not.toHaveBeenCalled();
  });

  it('initializes with environment and release metadata', () => {
    expect(
      initSentry({
        APP_COMMIT_SHA: ' commit-sha ',
        NODE_ENV: ' production ',
        SENTRY_DSN: ' https://examplePublicKey@example.ingest.sentry.io/1 ',
      }),
    ).toBe(true);

    expect(sentryMocks.init).toHaveBeenCalledWith({
      dsn: 'https://examplePublicKey@example.ingest.sentry.io/1',
      environment: 'production',
      release: 'commit-sha',
      sendDefaultPii: false,
    });
  });

  it('leaves release undefined when APP_COMMIT_SHA is blank', () => {
    initSentry({
      APP_COMMIT_SHA: '   ',
      SENTRY_DSN: 'https://examplePublicKey@example.ingest.sentry.io/1',
    });

    expect(sentryMocks.init).toHaveBeenCalledWith(
      expect.objectContaining({ release: undefined }),
    );
  });

  it('captures an exception with request metadata tags', () => {
    const error = new Error('boom');

    captureServerException(error, {
      method: 'POST',
      route: '/users/:userId',
    });

    expect(sentryMocks.setTag).toHaveBeenCalledWith('http.method', 'POST');
    expect(sentryMocks.setTag).toHaveBeenCalledWith(
      'http.route',
      '/users/:userId',
    );
    expect(sentryMocks.captureException).toHaveBeenCalledWith(error);
  });

  it('omits tags when no request metadata is available', () => {
    captureServerException(new Error('boom'));

    expect(sentryMocks.setTag).not.toHaveBeenCalled();
    expect(sentryMocks.captureException).toHaveBeenCalled();
  });
});
