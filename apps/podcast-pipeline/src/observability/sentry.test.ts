import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  withScope: vi.fn((callback: (scope: unknown) => void) =>
    callback({
      setContext: sentryMocks.setContext,
      setLevel: sentryMocks.setLevel,
      setTag: sentryMocks.setTag,
    }),
  ),
}));

import {
  capturePipelineException,
  captureServerException,
  flushSentry,
  initSentry,
} from './sentry.js';

describe('podcast pipeline Sentry observability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sentryMocks.flush.mockResolvedValue(true);
  });

  it('does not initialize without a non-blank DSN', () => {
    expect(initSentry({ SENTRY_PODCAST_PIPELINE_DSN: '' })).toBe(false);
    expect(sentryMocks.init).not.toHaveBeenCalled();
  });

  it('initializes error-only reporting', () => {
    expect(
      initSentry({
        APP_COMMIT_SHA: 'sha',
        NODE_ENV: 'production',
        SENTRY_PODCAST_PIPELINE_DSN: 'https://example.test/2',
      }),
    ).toBe(true);
    expect(sentryMocks.init).toHaveBeenCalledWith({
      dsn: 'https://example.test/2',
      environment: 'production',
      release: 'sha',
      sendDefaultPii: false,
      skipOpenTelemetrySetup: true,
    });
  });

  it('captures request template metadata', () => {
    const error = new Error('boom');
    captureServerException(error, { method: 'GET', route: '/episodes/:id' });
    expect(sentryMocks.setTag).toHaveBeenCalledWith('http.method', 'GET');
    expect(sentryMocks.setTag).toHaveBeenCalledWith(
      'http.route',
      '/episodes/:id',
    );
    expect(sentryMocks.captureException).toHaveBeenCalledWith(error);
  });

  it('tags the component and keeps per-episode detail out of tags', () => {
    const error = new Error('write EPIPE');
    capturePipelineException(error, {
      component: 'ingest',
      tags: { entrypoint: 'telegram', step: 'uploadMainHlsToR2' },
      context: { url: 'https://news.test/a', runId: 'abcd1234' },
    });

    expect(sentryMocks.setTag).toHaveBeenCalledWith('component', 'ingest');
    expect(sentryMocks.setTag).toHaveBeenCalledWith('entrypoint', 'telegram');
    expect(sentryMocks.setTag).toHaveBeenCalledWith(
      'step',
      'uploadMainHlsToR2',
    );
    // A URL as a tag would blow up cardinality; it belongs in context.
    expect(sentryMocks.setTag).not.toHaveBeenCalledWith(
      'url',
      expect.anything(),
    );
    expect(sentryMocks.setContext).toHaveBeenCalledWith('pipeline', {
      url: 'https://news.test/a',
      runId: 'abcd1234',
    });
    expect(sentryMocks.captureException).toHaveBeenCalledWith(error);
  });

  it('skips undefined tags rather than sending them empty', () => {
    capturePipelineException(new Error('boom'), {
      component: 'video-render',
      tags: { step: undefined },
    });

    expect(sentryMocks.setTag).toHaveBeenCalledTimes(1);
    expect(sentryMocks.setTag).toHaveBeenCalledWith(
      'component',
      'video-render',
    );
    expect(sentryMocks.setLevel).not.toHaveBeenCalled();
  });

  it('downgrades a failure that will be retried to a warning', () => {
    capturePipelineException(new Error('boom'), {
      component: 'video-visual',
      level: 'warning',
    });

    expect(sentryMocks.setLevel).toHaveBeenCalledWith('warning');
  });

  it('flushes buffered events before process exit', async () => {
    await expect(flushSentry()).resolves.toBe(true);
    expect(sentryMocks.flush).toHaveBeenCalledWith(5_000);
  });

  it('does not let a flush failure replace the original process failure', async () => {
    sentryMocks.flush.mockRejectedValueOnce(new Error('transport down'));
    await expect(flushSentry(1_000)).resolves.toBe(false);
  });
});
