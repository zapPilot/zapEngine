import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createDeferred } from '../__fixtures__/index-test.js';

const mocks = vi.hoisted(() => ({
  perform: vi.fn(),
  send: vi.fn(),
  invalidate: vi.fn(),
  capture: vi.fn(),
  flush: vi.fn(async () => true),
  parse: vi.fn(),
  realParse: undefined as undefined | ((value: unknown) => unknown),
  allowSource: vi.fn(() => true),
}));

vi.mock('../observability/sentry.js', () => ({
  capturePipelineException: mocks.capture,
  flushSentry: mocks.flush,
}));

vi.mock('./post-ingest.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./post-ingest.js')>()),
  performMultilingualIngestAndEnqueueVideo: mocks.perform,
}));

vi.mock('./episode-search.js', () => ({
  invalidateEpisodeSearchCache: mocks.invalidate,
}));

vi.mock('./cost.js', () => ({
  buildIngestSummaryFromResult: vi.fn(() => 'summary'),
}));

vi.mock('./telegram.js', () => ({
  buildTelegramAudioReadyMessage: vi.fn(
    (_summary: unknown, _episode: string, lifecycle: string) =>
      `ready:${lifecycle}`,
  ),
  buildTelegramFailureMessage: vi.fn(
    (_error: unknown, url: string) => `failed:${url}`,
  ),
  sendTelegramNotification: mocks.send,
  TELEGRAM_INFLIGHT_TEXT: 'inflight',
  TELEGRAM_QUEUED_TEXT: 'queued',
  TELEGRAM_RETRY_REPLY_MARKUP: { inline_keyboard: [['retry']] },
}));

vi.mock('./telegram-source.js', () => ({
  isAllowedTelegramSourceUrl: mocks.allowSource,
  TELEGRAM_UNSUPPORTED_SOURCE_TEXT: 'unsupported',
}));

vi.mock('./ingest-jobs.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('./ingest-jobs.js')>();
  mocks.realParse = original.parsePodcastIngestJobRow;
  return {
    ...original,
    parsePodcastIngestJobRow: (value: unknown) => mocks.parse(value),
  };
});

import {
  PODCAST_INGEST_MAX_CONCURRENT_JOBS,
  type PodcastIngestJobRow,
  type PodcastIngestJobStore,
} from './ingest-jobs.js';
import { createTelegramIngestQueue } from './telegram-ingest-queue.js';

function row(
  overrides: Partial<PodcastIngestJobRow> = {},
): PodcastIngestJobRow {
  return {
    id: '00000000-0000-4000-8000-000000000099',
    source_url: 'https://example.test/article',
    language_code: 'zh-Hant',
    telegram_chat_id: 'chat-1',
    status: 'processing',
    attempt_count: 1,
    lease_owner: 'owner',
    lease_expires_at: '2026-09-15T00:00:00.000Z',
    last_error: null,
    ...overrides,
  };
}

function fakeStore(
  overrides: Partial<PodcastIngestJobStore> = {},
): PodcastIngestJobStore {
  return {
    enqueue: vi.fn(async () => row({ status: 'queued' })),
    claim: vi.fn(async () => row()),
    claimNext: vi.fn(async () => null),
    renew: vi.fn(async () => undefined),
    finish: vi.fn(async () => undefined),
    ...overrides,
  };
}

function success() {
  return {
    ingest: { episode: { id: 'episode-1' } },
    videoJob: { status: 'queued' },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.parse.mockImplementation((value: unknown) => mocks.realParse!(value));
  mocks.allowSource.mockReturnValue(true);
  mocks.perform.mockResolvedValue(success());
  mocks.send.mockResolvedValue(undefined);
  mocks.flush.mockResolvedValue(true);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('Telegram ingest queue remaining durability branches', () => {
  it('uses the production default store when NODE_ENV is not test', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(() =>
      createTelegramIngestQueue({ startRecoveryLoop: false }),
    ).not.toThrow();
  });

  it('logs durable finish failures without failing a completed ingest', async () => {
    const finish = vi.fn().mockRejectedValue(new Error('finish down'));
    const store = fakeStore({
      claimNext: vi
        .fn()
        .mockResolvedValueOnce(row())
        .mockResolvedValueOnce(null),
      finish,
    });
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const queue = createTelegramIngestQueue({
      jobStore: store,
      startRecoveryLoop: false,
    });

    await queue.recoverNow();

    await vi.waitFor(() =>
      expect(mocks.send).toHaveBeenCalledWith('chat-1', 'ready:queued'),
    );
    expect(consoleError).toHaveBeenCalledWith(
      '[telegram-ingest-queue] durable job finish failed',
      expect.objectContaining({
        jobId: row().id,
        status: 'completed',
        error: 'finish down',
      }),
    );
  });

  it('renews a durable lease and logs heartbeat renewal failures', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const run = createDeferred<unknown>();
    mocks.perform.mockReturnValue(run.promise);
    const renew = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('renew down'));
    const store = fakeStore({
      claimNext: vi
        .fn()
        .mockResolvedValueOnce(row())
        .mockResolvedValueOnce(null),
      renew,
    });
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const queue = createTelegramIngestQueue({
      jobStore: store,
      startRecoveryLoop: false,
    });

    await queue.recoverNow();
    await vi.waitFor(() => expect(mocks.perform).toHaveBeenCalledOnce());

    await vi.advanceTimersByTimeAsync(30_000);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(renew).toHaveBeenCalledTimes(2);
    expect(consoleError).toHaveBeenCalledWith(
      '[telegram-ingest-queue] lease renew failed',
      expect.objectContaining({ jobId: row().id, error: 'renew down' }),
    );

    run.resolve(success());
    await vi.waitFor(() =>
      expect(store.finish).toHaveBeenCalledWith(
        row().id,
        expect.any(String),
        'completed',
        undefined,
      ),
    );
  });

  it('marks operator failures as operator entrypoints and sends no Telegram message', async () => {
    mocks.perform.mockRejectedValueOnce(new Error('operator failed'));
    const recovered = row({ telegram_chat_id: null });
    const store = fakeStore({
      claimNext: vi
        .fn()
        .mockResolvedValueOnce(recovered)
        .mockResolvedValueOnce(null),
    });
    const queue = createTelegramIngestQueue({
      jobStore: store,
      startRecoveryLoop: false,
    });

    await queue.recoverNow();

    await vi.waitFor(() => expect(mocks.capture).toHaveBeenCalledOnce());
    expect(mocks.capture).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        tags: expect.objectContaining({ entrypoint: 'operator' }),
      }),
    );
    expect(mocks.send).not.toHaveBeenCalled();
    await vi.waitFor(() =>
      expect(store.finish).toHaveBeenCalledWith(
        recovered.id,
        expect.any(String),
        'failed',
        'operator failed',
      ),
    );
  });

  it('coalesces duplicate recovered jobs, including a null-chat duplicate', async () => {
    const run = createDeferred<unknown>();
    mocks.perform.mockReturnValue(run.promise);
    const jobs = [
      row({ id: 'job-1', telegram_chat_id: 'chat-old' }),
      row({ id: 'job-2', telegram_chat_id: 'chat-new' }),
      row({ id: 'job-3', telegram_chat_id: null }),
    ];
    const claimNext = vi
      .fn()
      .mockResolvedValueOnce(jobs[0])
      .mockResolvedValueOnce(jobs[1])
      .mockResolvedValueOnce(jobs[2])
      .mockResolvedValue(null);
    const store = fakeStore({ claimNext });
    const queue = createTelegramIngestQueue({
      jobStore: store,
      startRecoveryLoop: false,
    });

    await queue.recoverNow();
    expect(mocks.perform).toHaveBeenCalledTimes(0);

    await vi.waitFor(() => expect(mocks.perform).toHaveBeenCalledOnce());
    run.resolve(success());

    await vi.waitFor(() =>
      expect(mocks.send).toHaveBeenCalledWith('chat-new', 'ready:queued'),
    );
    expect(mocks.perform).toHaveBeenCalledTimes(1);
  });

  it('updates an already-pending local fallback job instead of adding another', async () => {
    const runs = Array.from(
      { length: PODCAST_INGEST_MAX_CONCURRENT_JOBS },
      () => createDeferred<unknown>(),
    );
    mocks.perform.mockImplementation(() => {
      const run = runs[mocks.perform.mock.calls.length - 1];
      if (!run) throw new Error('unexpected ingest');
      return run.promise;
    });
    const queue = createTelegramIngestQueue({ jobStore: null });

    for (let index = 0; index < PODCAST_INGEST_MAX_CONCURRENT_JOBS; index++) {
      queue.enqueue(
        `chat-${index}`,
        `https://example.test/active-${index}`,
        'zh-Hant',
      );
    }
    await vi.waitFor(() =>
      expect(mocks.perform).toHaveBeenCalledTimes(
        PODCAST_INGEST_MAX_CONCURRENT_JOBS,
      ),
    );

    const pendingUrl = 'https://example.test/pending';
    queue.enqueue('chat-pending-1', pendingUrl, 'zh-Hant');
    await vi.waitFor(() =>
      expect(mocks.send).toHaveBeenCalledWith('chat-pending-1', 'queued'),
    );
    queue.enqueue('chat-pending-2', pendingUrl, 'zh-Hant');
    await vi.waitFor(() =>
      expect(mocks.send).toHaveBeenCalledWith('chat-pending-2', 'inflight'),
    );

    for (const run of runs) run.resolve(success());
  });

  it('refreshes the latest chat for an active local ingest without a durable store', async () => {
    const run = createDeferred<unknown>();
    const url = 'https://example.test/active-local';
    mocks.perform.mockImplementation((calledUrl: string) =>
      calledUrl === url ? run.promise : Promise.resolve(success()),
    );
    const queue = createTelegramIngestQueue({ jobStore: null });

    queue.enqueue('chat-old', url, 'zh-Hant');
    await vi.waitFor(() =>
      expect(mocks.perform).toHaveBeenCalledWith(
        url,
        'zh-Hant',
        expect.anything(),
      ),
    );
    queue.enqueue('chat-new', url, 'zh-Hant');

    await vi.waitFor(() =>
      expect(mocks.send).toHaveBeenCalledWith('chat-new', 'inflight'),
    );
    run.resolve(success());
    await vi.waitFor(() =>
      expect(mocks.send).toHaveBeenCalledWith('chat-new', 'ready:queued'),
    );
  });

  it('refreshes durable chat ownership and logs a refresh failure', async () => {
    const run = createDeferred<unknown>();
    mocks.perform.mockReturnValue(run.promise);
    const enqueue = vi
      .fn()
      .mockResolvedValueOnce(row({ status: 'processing' }))
      .mockRejectedValueOnce(new Error('refresh down'));
    const store = fakeStore({
      enqueue,
      claimNext: vi.fn().mockResolvedValueOnce(row()).mockResolvedValue(null),
    });
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const queue = createTelegramIngestQueue({
      jobStore: store,
      startRecoveryLoop: false,
    });

    await queue.recoverNow();
    await vi.waitFor(() => expect(mocks.perform).toHaveBeenCalledOnce());

    queue.enqueue('chat-new', row().source_url, 'zh-Hant');
    await vi.waitFor(() =>
      expect(enqueue).toHaveBeenCalledWith({
        chatId: 'chat-new',
        url: row().source_url,
        languageCode: 'zh-Hant',
      }),
    );

    queue.enqueue('chat-newer', row().source_url, 'zh-Hant');
    await vi.waitFor(() =>
      expect(consoleError).toHaveBeenCalledWith(
        '[telegram-ingest-queue] chat refresh failed',
        expect.objectContaining({
          url: row().source_url,
          error: 'refresh down',
        }),
      ),
    );

    run.resolve(success());
  });

  it('falls back to the bounded local queue when durable enqueue fails', async () => {
    const store = fakeStore({
      enqueue: vi.fn().mockRejectedValue(new Error('supabase down')),
    });
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const queue = createTelegramIngestQueue({
      jobStore: store,
      startRecoveryLoop: false,
    });

    queue.enqueue('chat-1', 'https://example.test/fallback', 'zh-Hant');

    await vi.waitFor(() => expect(mocks.perform).toHaveBeenCalledOnce());
    expect(consoleError).toHaveBeenCalledWith(
      '[telegram-ingest-queue] durable enqueue failed',
      expect.objectContaining({
        url: 'https://example.test/fallback',
        error: 'supabase down',
      }),
    );
  });

  it('propagates a generic recovered-row parser failure to the recovery scanner', async () => {
    mocks.parse.mockImplementationOnce(() => {
      throw new Error('parser exploded');
    });
    const store = fakeStore({
      claimNext: vi.fn().mockResolvedValueOnce(row()),
    });
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const queue = createTelegramIngestQueue({
      jobStore: store,
      startRecoveryLoop: false,
    });

    await queue.recoverNow();

    expect(consoleError).toHaveBeenCalledWith(
      '[telegram-ingest-queue] recovery scan failed',
      { error: 'parser exploded' },
    );
  });

  it('logs generic claim failures without trying to quarantine them', async () => {
    const store = fakeStore({
      claimNext: vi.fn().mockRejectedValue(new Error('claim down')),
    });
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const queue = createTelegramIngestQueue({
      jobStore: store,
      startRecoveryLoop: false,
    });

    await queue.recoverNow();

    expect(store.finish).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith(
      '[telegram-ingest-queue] recovery scan failed',
      { error: 'claim down' },
    );
  });

  it('starts and executes the periodic recovery loop when enabled by environment', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const claimNext = vi.fn().mockResolvedValue(null);
    const store = fakeStore({ claimNext });

    createTelegramIngestQueue({ jobStore: store });
    await new Promise<void>((resolve) => process.nextTick(resolve));
    await vi.waitFor(() => expect(claimNext).toHaveBeenCalledTimes(1));

    await vi.advanceTimersByTimeAsync(30_000);
    expect(claimNext).toHaveBeenCalledTimes(2);
  });

  it('handles malformed sourceHost input on a local failure path', async () => {
    mocks.perform.mockRejectedValueOnce(new Error('bad url ingest'));
    const queue = createTelegramIngestQueue({ jobStore: null });

    queue.enqueue('chat-1', 'not a valid url', 'zh-Hant');

    await vi.waitFor(() => expect(mocks.capture).toHaveBeenCalledOnce());
    expect(mocks.capture).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        context: expect.objectContaining({
          url: 'not a valid url',
          sourceHost: undefined,
        }),
      }),
    );
  });

  it('covers the final duplicate guard inside startLocalJob', async () => {
    const queue = createTelegramIngestQueue({ jobStore: null });
    const url = 'https://example.test/start-local-duplicate';
    const key = `zh-Hant:${url}`;
    const originalGet = Map.prototype.get;
    let matchingGets = 0;
    const get = vi.spyOn(Map.prototype, 'get').mockImplementation(function (
      this: Map<unknown, unknown>,
      candidate: unknown,
    ) {
      if (candidate === key) {
        matchingGets += 1;
        if (matchingGets === 3) {
          return {
            latestChatId: null,
            promise: Promise.resolve(),
          };
        }
      }
      return originalGet.call(this, candidate);
    });

    queue.enqueue('chat-duplicate', url, 'zh-Hant');

    await vi.waitFor(() =>
      expect(mocks.send).toHaveBeenCalledWith('chat-duplicate', 'inflight'),
    );
    expect(mocks.perform).not.toHaveBeenCalledWith(
      url,
      'zh-Hant',
      expect.anything(),
    );
    get.mockRestore();
  });

  it('covers the stale clearWhenDone identity guard without mutating production state', async () => {
    const run = createDeferred<unknown>();
    mocks.perform.mockReturnValue(run.promise);
    const queue = createTelegramIngestQueue({ jobStore: null });
    const url = 'https://example.test/stale-clear';

    queue.enqueue('chat-1', url, 'zh-Hant');
    await vi.waitFor(() => expect(mocks.perform).toHaveBeenCalledOnce());

    const originalGet = Map.prototype.get;
    const get = vi.spyOn(Map.prototype, 'get').mockImplementation(function (
      this: Map<unknown, unknown>,
      key: unknown,
    ) {
      if (key === `zh-Hant:${url}`) return {};
      return originalGet.call(this, key);
    });

    run.resolve(success());
    await new Promise((resolve) => setTimeout(resolve, 0));
    get.mockRestore();
  });
});
