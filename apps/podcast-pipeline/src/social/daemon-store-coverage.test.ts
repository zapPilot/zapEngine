import { beforeEach, describe, expect, it, vi } from 'vitest';

interface QueryResult {
  data: unknown;
  error: unknown;
}

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  terminalResults: [] as QueryResult[],
}));

vi.mock('../services/supabase-client.js', () => ({
  getPipelineSupabase: () => ({ from: mocks.from }),
  throwSupabaseError: (error: unknown) => {
    throw error instanceof Error ? error : new Error(String(error));
  },
}));

import {
  completeSocialPublishJob,
  getSocialQueueSnapshot,
} from './daemon-store.js';

function nextResult(): QueryResult {
  const result = mocks.terminalResults.shift();
  if (!result) throw new Error('No queued Supabase result.');
  return result;
}

function queryBuilder() {
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
    update: vi.fn(),
    returns: vi.fn(),
    maybeSingle: vi.fn(),
    then: vi.fn(),
  };
  for (const method of ['select', 'eq', 'in', 'update'] as const) {
    builder[method].mockImplementation(() => builder);
  }
  builder.returns.mockImplementation(() => Promise.resolve(nextResult()));
  builder.maybeSingle.mockImplementation(() => Promise.resolve(nextResult()));
  builder.then.mockImplementation(
    (
      resolve: (value: QueryResult) => unknown,
      reject: (reason: unknown) => unknown,
    ) => Promise.resolve(nextResult()).then(resolve, reject),
  );
  return builder;
}

function queue(...results: QueryResult[]): void {
  mocks.terminalResults.push(...results);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.terminalResults.length = 0;
  mocks.from.mockImplementation(() => queryBuilder());
});

describe('social daemon store defensive query paths', () => {
  it('returns an empty snapshot when Supabase returns null data', async () => {
    queue({ data: null, error: null });

    await expect(getSocialQueueSnapshot()).resolves.toEqual({
      pendingCount: 0,
      episodeQueue: [],
      nextByPlatform: {},
    });
  });

  it('surfaces publish-job and localization query errors', async () => {
    queue({ data: null, error: new Error('jobs unavailable') });
    await expect(getSocialQueueSnapshot()).rejects.toThrow('jobs unavailable');

    queue(
      {
        data: [
          {
            episode_id: 'episode-1',
            platform: 'x',
            status: 'queued',
            scheduled_at: '2026-08-16T10:05:00.000Z',
            next_attempt_at: '2026-08-16T10:05:00.000Z',
          },
        ],
        error: null,
      },
      { data: null, error: new Error('localizations unavailable') },
    );
    await expect(getSocialQueueSnapshot()).rejects.toThrow(
      'localizations unavailable',
    );
  });

  it('keeps queue entries usable when localization titles are unavailable', async () => {
    queue(
      {
        data: [
          {
            episode_id: 'episode-1',
            platform: 'x',
            status: 'queued',
            scheduled_at: '2026-08-16T10:05:00.000Z',
            next_attempt_at: '2026-08-16T10:05:00.000Z',
          },
        ],
        error: null,
      },
      { data: null, error: null },
    );

    await expect(getSocialQueueSnapshot()).resolves.toEqual({
      pendingCount: 1,
      episodeQueue: [
        {
          episodeId: 'episode-1',
          title: null,
          nextAt: '2026-08-16T10:05:00.000Z',
        },
      ],
      nextByPlatform: {
        x: {
          episodeId: 'episode-1',
          languageCode: 'zh-Hant',
          platform: 'x',
          status: 'queued',
          title: null,
          nextAt: '2026-08-16T10:05:00.000Z',
        },
      },
    });
  });

  it('surfaces completion query errors and lost leases', async () => {
    const input = {
      jobId: 'job-1',
      owner: 'worker-1',
      completedAt: new Date('2026-08-16T10:00:00.000Z'),
    };

    queue({ data: null, error: new Error('update unavailable') });
    await expect(completeSocialPublishJob(input)).rejects.toThrow(
      'update unavailable',
    );

    queue({ data: null, error: null });
    await expect(completeSocialPublishJob(input)).rejects.toThrow(
      'lease was lost',
    );
  });
});
