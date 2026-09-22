import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createDeferred } from '../__fixtures__/index-test.js';
import {
  PodcastIngestJobContractError,
  type PodcastIngestJobRow,
  type PodcastIngestJobStore,
} from './ingest-jobs.js';

const mocks = vi.hoisted(() => ({
  perform: vi.fn(),
  send: vi.fn(),
  invalidate: vi.fn(),
  capture: vi.fn(),
  flush: vi.fn(async () => true),
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
  buildTelegramAudioReadyMessage: vi.fn(() => 'ready'),
  buildTelegramFailureMessage: vi.fn(() => 'failed'),
  sendTelegramNotification: mocks.send,
  TELEGRAM_INFLIGHT_TEXT: 'inflight',
  TELEGRAM_QUEUED_TEXT: 'queued',
  TELEGRAM_RETRY_REPLY_MARKUP: { inline_keyboard: [['retry']] },
}));

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
    lease_expires_at: new Date(Date.now() + 60_000).toISOString(),
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

beforeEach(() => {
  vi.clearAllMocks();
  mocks.send.mockResolvedValue(undefined);
  mocks.flush.mockResolvedValue(true);
  mocks.perform.mockResolvedValue({
    ingest: { episode: { id: 'episode-1' } },
    videoJob: { status: 'queued' },
  });
});

describe('durable Telegram ingest queue', () => {
  it('persists into the backlog and claims through the bounded pump', async () => {
    const claimed = row();
    const store = fakeStore({
      claimNext: vi.fn().mockResolvedValueOnce(claimed).mockResolvedValue(null),
    });
    const queue = createTelegramIngestQueue({
      jobStore: store,
      startRecoveryLoop: false,
    });

    queue.enqueue('chat-1', 'https://example.test/article', 'zh-Hant');

    await vi.waitFor(() => expect(mocks.perform).toHaveBeenCalledTimes(1));
    expect(store.enqueue).toHaveBeenCalledWith({
      chatId: 'chat-1',
      url: 'https://example.test/article',
      languageCode: 'zh-Hant',
    });
    expect(store.claim).not.toHaveBeenCalled();
    expect(store.claimNext).toHaveBeenCalled();
    await vi.waitFor(() =>
      expect(store.finish).toHaveBeenCalledWith(
        row().id,
        expect.any(String),
        'completed',
        undefined,
      ),
    );
  });

  it('does not duplicate work when another process owns a live lease', async () => {
    const store = fakeStore({
      enqueue: vi.fn(async () => row({ status: 'processing' })),
      claimNext: vi.fn(async () => null),
    });
    const queue = createTelegramIngestQueue({
      jobStore: store,
      startRecoveryLoop: false,
    });

    queue.enqueue('chat-1', 'https://example.test/article', 'zh-Hant');

    await vi.waitFor(() =>
      expect(mocks.send).toHaveBeenCalledWith('chat-1', 'inflight'),
    );
    expect(mocks.perform).not.toHaveBeenCalled();
  });

  it('never claims a fifth durable job until one of four active jobs finishes', async () => {
    const jobs = Array.from({ length: 5 }, (_, index) =>
      row({
        id: `00000000-0000-4000-8000-00000000010${index}`,
        source_url: `https://example.test/capacity-${index}`,
        telegram_chat_id: `chat-${index}`,
      }),
    );
    const claimNext = vi
      .fn()
      .mockResolvedValueOnce(jobs[0])
      .mockResolvedValueOnce(jobs[1])
      .mockResolvedValueOnce(jobs[2])
      .mockResolvedValueOnce(jobs[3])
      .mockResolvedValueOnce(jobs[4])
      .mockResolvedValue(null);
    const store = fakeStore({ claimNext });
    const runs = Array.from({ length: 5 }, () => createDeferred<unknown>());
    mocks.perform.mockImplementation(() => {
      const run = runs[mocks.perform.mock.calls.length - 1];
      if (!run) throw new Error('unexpected ingest');
      return run.promise;
    });
    const queue = createTelegramIngestQueue({
      jobStore: store,
      startRecoveryLoop: false,
    });

    await queue.recoverNow();

    await vi.waitFor(() => expect(mocks.perform).toHaveBeenCalledTimes(4));
    expect(claimNext).toHaveBeenCalledTimes(4);

    runs[0]!.resolve({
      ingest: { episode: { id: 'episode-1' } },
      videoJob: { status: 'queued' },
    });
    await vi.waitFor(() => expect(mocks.perform).toHaveBeenCalledTimes(5));
    expect(claimNext).toHaveBeenCalledTimes(5);

    for (const run of runs.slice(1)) {
      run.resolve({
        ingest: { episode: { id: 'episode-1' } },
        videoJob: { status: 'queued' },
      });
    }
  });

  it('claims a stale queued/processing job during recovery and resumes it', async () => {
    const recovered = row({
      source_url: 'https://example.test/recovered',
      telegram_chat_id: 'chat-recovered',
    });
    const store = fakeStore({
      claimNext: vi
        .fn()
        .mockResolvedValueOnce(recovered)
        .mockResolvedValue(null),
    });
    const queue = createTelegramIngestQueue({
      jobStore: store,
      startRecoveryLoop: false,
    });

    await queue.recoverNow();

    await vi.waitFor(() =>
      expect(mocks.perform).toHaveBeenCalledWith(
        'https://example.test/recovered',
        'zh-Hant',
        expect.objectContaining({ trigger: 'telegram' }),
      ),
    );
    await vi.waitFor(() =>
      expect(store.finish).toHaveBeenCalledWith(
        recovered.id,
        expect.any(String),
        'completed',
        undefined,
      ),
    );
  });

  it('runs an operator recovery job without sending Telegram notifications', async () => {
    const recovered = row({
      source_url: 'https://example.test/operator-recovery',
      telegram_chat_id: null,
    });
    const store = fakeStore({
      claimNext: vi
        .fn()
        .mockResolvedValueOnce(recovered)
        .mockResolvedValue(null),
    });
    const queue = createTelegramIngestQueue({
      jobStore: store,
      startRecoveryLoop: false,
    });

    await queue.recoverNow();

    await vi.waitFor(() => expect(mocks.perform).toHaveBeenCalledTimes(1));
    expect(mocks.send).not.toHaveBeenCalled();
    const options = mocks.perform.mock.calls[0]?.[2] as
      | { telegramChatId?: () => unknown }
      | undefined;
    expect(options?.telegramChatId?.()).toBeUndefined();
    await vi.waitFor(() =>
      expect(store.finish).toHaveBeenCalledWith(
        recovered.id,
        expect.any(String),
        'completed',
        undefined,
      ),
    );
  });

  it('quarantines a poison recovered row before it can reach ingest', async () => {
    const poison = {
      ...row(),
      source_url: null,
    } as unknown as PodcastIngestJobRow;
    const store = fakeStore({
      claimNext: vi.fn().mockResolvedValueOnce(poison).mockResolvedValue(null),
    });
    const queue = createTelegramIngestQueue({
      jobStore: store,
      startRecoveryLoop: false,
    });

    await queue.recoverNow();

    expect(mocks.perform).not.toHaveBeenCalled();
    expect(store.finish).toHaveBeenCalledWith(
      poison.id,
      expect.any(String),
      'failed',
      expect.stringContaining('source_url must be a non-empty string'),
    );
    expect(mocks.capture).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        component: 'ingest',
        tags: expect.objectContaining({
          entrypoint: 'telegram',
          failure_kind: 'durable-job-contract',
        }),
      }),
    );
    expect(mocks.flush).toHaveBeenCalled();
  });

  it('quarantines a poison row rejected by the production store parser', async () => {
    const jobId = row().id;
    const contractError = new PodcastIngestJobContractError(
      'source_url must be a non-empty string',
      jobId,
    );
    const store = fakeStore({
      claimNext: vi.fn(async () => {
        throw contractError;
      }),
    });
    const queue = createTelegramIngestQueue({
      jobStore: store,
      startRecoveryLoop: false,
    });
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    await queue.recoverNow();

    expect(mocks.perform).not.toHaveBeenCalled();
    expect(store.finish).toHaveBeenCalledWith(
      jobId,
      expect.any(String),
      'failed',
      expect.stringContaining('source_url must be a non-empty string'),
    );
    expect(mocks.capture).toHaveBeenCalledWith(
      contractError,
      expect.objectContaining({
        component: 'ingest',
        tags: expect.objectContaining({
          entrypoint: 'telegram',
          failure_kind: 'durable-job-contract',
        }),
      }),
    );
    expect(mocks.flush).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
