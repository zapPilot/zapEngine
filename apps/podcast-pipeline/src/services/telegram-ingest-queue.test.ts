import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  perform: vi.fn(),
  invalidate: vi.fn(),
  send: vi.fn(),
  audioReady: vi.fn(
    (_summary: unknown, _episodeId: string, lifecycle: string) =>
      `ready:${lifecycle}`,
  ),
  failure: vi.fn((_error: unknown, url: string) => `failed:${url}`),
  summary: vi.fn(() => ({ total: 1 })),
  capture: vi.fn(),
  flush: vi.fn(async () => true),
}));

vi.mock('../observability/sentry.js', () => ({
  capturePipelineException: mocks.capture,
  flushSentry: mocks.flush,
}));
// `failedIngestRunContext` stays real: a test that reimplemented how the run
// context is read off the error could not notice the two drifting apart.
vi.mock('./post-ingest.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./post-ingest.js')>()),
  performMultilingualIngestAndEnqueueVideo: mocks.perform,
}));
vi.mock('./episode-search.js', () => ({
  invalidateEpisodeSearchCache: mocks.invalidate,
}));
vi.mock('./cost.js', () => ({ buildIngestSummaryFromResult: mocks.summary }));
vi.mock('./telegram.js', () => ({
  buildTelegramAudioReadyMessage: mocks.audioReady,
  buildTelegramFailureMessage: mocks.failure,
  sendTelegramNotification: mocks.send,
  TELEGRAM_INFLIGHT_TEXT: 'inflight',
  TELEGRAM_RETRY_REPLY_MARKUP: { inline_keyboard: [['retry']] },
  TELEGRAM_START_TEXT: 'start',
}));

import { createTelegramIngestQueue } from './telegram-ingest-queue.js';
import { TELEGRAM_UNSUPPORTED_SOURCE_TEXT } from './telegram-source.js';

function ingestResult() {
  return { episode: { id: 'episode-1' } };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.send.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('Telegram ingest queue', () => {
  it.each([
    ['queued', { status: 'queued' }],
    ['completed', { status: 'completed' }],
    ['unavailable', null],
  ] as const)(
    'reports %s video lifecycle after ingest',
    async (expected, videoJob) => {
      mocks.perform.mockResolvedValueOnce({ ingest: ingestResult(), videoJob });
      const queue = createTelegramIngestQueue();
      queue.enqueue('chat-1', `https://example.test/${expected}`, 'zh-Hant');

      await vi.waitFor(() =>
        expect(mocks.send).toHaveBeenCalledWith('chat-1', `ready:${expected}`),
      );
      expect(mocks.invalidate).toHaveBeenCalledOnce();
    },
  );

  it('routes ingest failures to a retryable Telegram message', async () => {
    mocks.perform.mockRejectedValueOnce(new Error('ingest failed'));
    const queue = createTelegramIngestQueue();
    queue.enqueue('chat-1', 'https://example.test/fail', 'zh-Hant');

    await vi.waitFor(() =>
      expect(mocks.send).toHaveBeenCalledWith(
        'chat-1',
        'failed:https://example.test/fail',
        { replyMarkup: { inline_keyboard: [['retry']] } },
      ),
    );
  });

  it('reports a terminal ingest failure to Sentry exactly once', async () => {
    // Nothing rethrows past the queue's catch, so this is the only path that can
    // turn a failed episode into a Sentry event — an HTTP-only reporter sees
    // none of it.
    const error = Object.assign(
      new Error('[step:uploadMainHlsToR2] write EPIPE'),
      {
        stepName: 'uploadMainHlsToR2',
      },
    );
    mocks.perform.mockRejectedValueOnce(error);
    const queue = createTelegramIngestQueue();
    queue.enqueue('chat-1', 'https://example.test/sentry', 'zh-Hant');

    await vi.waitFor(() => expect(mocks.capture).toHaveBeenCalledTimes(1));
    expect(mocks.capture).toHaveBeenCalledWith(error, {
      component: 'ingest',
      tags: {
        entrypoint: 'telegram',
        step: 'uploadMainHlsToR2',
        language: 'zh-Hant',
      },
      context: {
        url: 'https://example.test/sentry',
        sourceHost: 'example.test',
      },
    });
    // The submitter's chat id is never sent to Sentry.
    expect(JSON.stringify(mocks.capture.mock.calls)).not.toContain('chat-1');
    await vi.waitFor(() => expect(mocks.failure).toHaveBeenCalledTimes(1));
  });

  it('names the run and episode on the reported failure, then flushes', async () => {
    // The 2026-08-28 script timeout produced an event that named neither, so
    // it could not be matched against the log lines that explained it.
    const error = Object.assign(
      new Error('[step:generateScript] OpenRouter request timed out'),
      {
        stepName: 'generateScript',
        ingestRunRef: '26e50dd0',
        ingestEpisodeId: 'episode-1',
      },
    );
    mocks.perform.mockRejectedValueOnce(error);
    const queue = createTelegramIngestQueue();
    queue.enqueue('chat-1', 'https://example.test/timeout', 'zh-Hant');

    await vi.waitFor(() => expect(mocks.capture).toHaveBeenCalledTimes(1));
    expect(mocks.capture).toHaveBeenCalledWith(
      error,
      expect.objectContaining({
        tags: expect.objectContaining({ step: 'generateScript' }),
        context: {
          url: 'https://example.test/timeout',
          sourceHost: 'example.test',
          runRef: '26e50dd0',
          episodeId: 'episode-1',
        },
      }),
    );
    // Nothing else drains the queue in this long-lived process.
    await vi.waitFor(() => expect(mocks.flush).toHaveBeenCalledTimes(1));
  });

  it('does not report a successful ingest', async () => {
    mocks.perform.mockResolvedValueOnce({
      ingest: ingestResult(),
      videoJob: { status: 'queued' },
    });
    const queue = createTelegramIngestQueue();
    queue.enqueue('chat-1', 'https://example.test/ok', 'zh-Hant');

    await vi.waitFor(() =>
      expect(mocks.send).toHaveBeenCalledWith('chat-1', 'ready:queued'),
    );
    expect(mocks.capture).not.toHaveBeenCalled();
  });

  it('coalesces duplicate URLs and sends completion to the latest chat', async () => {
    let resolvePromise!: (value: unknown) => void;
    mocks.perform.mockReturnValueOnce(
      new Promise((resolve) => (resolvePromise = resolve)),
    );
    const queue = createTelegramIngestQueue();
    queue.enqueue('chat-old', 'https://example.test/same', 'zh-Hant');
    queue.enqueue('chat-new', 'https://example.test/same', 'zh-Hant');

    await vi.waitFor(() =>
      expect(mocks.send).toHaveBeenCalledWith('chat-new', 'inflight'),
    );
    resolvePromise({ ingest: ingestResult(), videoJob: { status: 'queued' } });
    await vi.waitFor(() =>
      expect(mocks.send).toHaveBeenCalledWith('chat-new', 'ready:queued'),
    );
    expect(mocks.perform).toHaveBeenCalledTimes(1);
  });

  it('schedules standalone messages on the next tick', async () => {
    const queue = createTelegramIngestQueue();
    queue.scheduleMessage('chat-1', 'hello');
    await vi.waitFor(() =>
      expect(mocks.send).toHaveBeenCalledWith('chat-1', 'hello'),
    );
  });

  it('blocks non-PANews URLs before ingest starts', async () => {
    vi.stubEnv('PIPELINE_TELEGRAM_ALLOWED_SOURCE_HOSTS', '');
    const queue = createTelegramIngestQueue();
    queue.enqueue(
      'chat-1',
      'https://pub-example.r2.dev/episodes/example/playlist.m3u8',
      'zh-Hant',
    );

    await vi.waitFor(() =>
      expect(mocks.send).toHaveBeenCalledWith(
        'chat-1',
        TELEGRAM_UNSUPPORTED_SOURCE_TEXT,
      ),
    );
    expect(mocks.perform).not.toHaveBeenCalled();
  });
});
