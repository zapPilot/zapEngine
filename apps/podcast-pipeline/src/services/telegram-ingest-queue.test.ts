import { beforeEach, describe, expect, it, vi } from 'vitest';

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
}));

vi.mock('./post-ingest.js', () => ({
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

function ingestResult() {
  return { episode: { id: 'episode-1' } };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.send.mockResolvedValue(undefined);
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
});
