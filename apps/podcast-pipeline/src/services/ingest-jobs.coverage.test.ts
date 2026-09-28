import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const db: unknown = null;
  return {
    maybeOne: vi.fn(),
    expectNoError: vi.fn(),
    db,
  };
});

vi.mock('./supabase-client.js', () => ({
  getPipelineSupabase: () => mocks.db,
}));

vi.mock('./supabase-rows.js', () => ({
  maybeOne: mocks.maybeOne,
  expectNoError: mocks.expectNoError,
}));

import {
  parsePodcastIngestJobRow,
  parsePodcastIngestJobRpcResult,
  PodcastIngestJobContractError,
  podcastIngestJobStore,
} from './ingest-jobs.js';

function validRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-1',
    source_url: 'https://example.test/article',
    language_code: 'zh-Hant',
    telegram_chat_id: '123',
    status: 'processing',
    attempt_count: 0,
    lease_owner: 'owner',
    lease_expires_at: null,
    last_error: null,
    ...overrides,
  };
}

beforeEach(() => {
  mocks.maybeOne.mockReset();
  mocks.expectNoError.mockReset().mockResolvedValue(undefined);

  const eq = vi.fn();
  const query = {
    update: vi.fn(() => query),
    eq,
  };
  eq.mockImplementation(() => query);

  mocks.db = {
    rpc: vi.fn(),
    from: vi.fn(() => query),
    query,
  };
});

describe('ingest job parser remaining contract branches', () => {
  it('does not attach a whitespace-only id to contract errors', () => {
    try {
      parsePodcastIngestJobRow(validRow({ id: '   ' }));
      expect.unreachable('expected invalid id');
    } catch (error) {
      expect(error).toBeInstanceOf(PodcastIngestJobContractError);
      expect((error as PodcastIngestJobContractError).jobId).toBeUndefined();
    }
  });

  it('rejects non-string nullable lease fields', () => {
    expect(() =>
      parsePodcastIngestJobRow(validRow({ lease_owner: 42 })),
    ).toThrow('lease_owner must be a string or null');
    expect(() =>
      parsePodcastIngestJobRow(validRow({ lease_expires_at: false })),
    ).toThrow('lease_expires_at must be a string or null');
    expect(() =>
      parsePodcastIngestJobRow(validRow({ last_error: {} })),
    ).toThrow('last_error must be a string or null');
  });

  it('rejects unsupported languages and statuses', () => {
    expect(() =>
      parsePodcastIngestJobRow(validRow({ language_code: 'xx' })),
    ).toThrow('unsupported language_code xx');
    expect(() =>
      parsePodcastIngestJobRow(validRow({ status: 'paused' })),
    ).toThrow('unsupported status paused');
  });

  it.each(['1', 1.5, -1])(
    'rejects invalid attempt counts %j',
    (attemptCount) => {
      expect(() =>
        parsePodcastIngestJobRow(validRow({ attempt_count: attemptCount })),
      ).toThrow('attempt_count must be a non-negative integer');
    },
  );

  it('covers undefined, empty-array, and empty-object RPC envelopes', () => {
    expect(parsePodcastIngestJobRpcResult(undefined)).toBeNull();
    expect(parsePodcastIngestJobRpcResult([])).toBeNull();
    expect(() => parsePodcastIngestJobRpcResult({})).toThrow(
      'id must be a non-empty string',
    );
  });
});

describe('podcastIngestJobStore', () => {
  it('enqueues, claims by id, and claims next through the durable RPCs', async () => {
    mocks.maybeOne
      .mockResolvedValueOnce(validRow({ status: 'queued' }))
      .mockResolvedValueOnce(validRow())
      .mockResolvedValueOnce(null);

    await expect(
      podcastIngestJobStore.enqueue({
        chatId: 123,
        url: 'https://example.test/article',
        languageCode: 'zh-Hant',
      }),
    ).resolves.toMatchObject({ id: 'job-1', status: 'queued' });

    await expect(
      podcastIngestJobStore.claim('job-1', 'owner', 60),
    ).resolves.toMatchObject({ id: 'job-1' });
    await expect(
      podcastIngestJobStore.claimNext('owner', 60),
    ).resolves.toBeNull();

    expect((mocks.db as any).rpc).toHaveBeenNthCalledWith(
      1,
      'enqueue_podcast_ingest_job',
      {
        p_source_url: 'https://example.test/article',
        p_language_code: 'zh-Hant',
        p_telegram_chat_id: '123',
      },
    );
    expect((mocks.db as any).rpc).toHaveBeenNthCalledWith(
      2,
      'claim_podcast_ingest_job',
      {
        p_job_id: 'job-1',
        p_owner: 'owner',
        p_lease_seconds: 60,
      },
    );
    expect((mocks.db as any).rpc).toHaveBeenNthCalledWith(
      3,
      'claim_next_podcast_ingest_job',
      {
        p_owner: 'owner',
        p_lease_seconds: 60,
      },
    );
  });

  it('fails closed when enqueue returns no job', async () => {
    mocks.maybeOne.mockResolvedValue(null);
    await expect(
      podcastIngestJobStore.enqueue({
        chatId: 1,
        url: 'https://example.test/article',
        languageCode: 'en',
      }),
    ).rejects.toThrow('Failed to enqueue podcast ingest job');
  });

  it('renews and finishes processing jobs with and without an error', async () => {
    vi.useFakeTimers();
    vi.setSystemTime('2026-09-15T00:00:00.000Z');
    try {
      await podcastIngestJobStore.renew('job-1', 'owner', 90);
      await podcastIngestJobStore.finish('job-1', 'owner', 'completed');
      await podcastIngestJobStore.finish(
        'job-1',
        'owner',
        'failed',
        'pipeline failed',
      );
    } finally {
      vi.useRealTimers();
    }

    expect(mocks.expectNoError).toHaveBeenCalledTimes(3);
    const query = (mocks.db as any).query;
    expect(query.update).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        lease_expires_at: '2026-09-15T00:01:30.000Z',
        updated_at: '2026-09-15T00:00:00.000Z',
      }),
    );
    expect(query.update).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        status: 'completed',
        lease_owner: null,
        lease_expires_at: null,
        last_error: null,
      }),
    );
    expect(query.update).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        status: 'failed',
        last_error: 'pipeline failed',
      }),
    );
    expect(query.eq).toHaveBeenCalledWith('id', 'job-1');
    expect(query.eq).toHaveBeenCalledWith('status', 'processing');
    expect(query.eq).toHaveBeenCalledWith('lease_owner', 'owner');
  });
});
