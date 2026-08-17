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
  latestScheduledSocialJobs,
  listSocialPublishCandidates,
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
    gte: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    update: vi.fn(),
    returns: vi.fn(),
    maybeSingle: vi.fn(),
    then: vi.fn(),
  };
  for (const method of [
    'select',
    'eq',
    'gte',
    'order',
    'limit',
    'update',
  ] as const) {
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
  it('returns an empty candidate list when Supabase returns null data', async () => {
    queue({ data: null, error: null });

    await expect(
      listSocialPublishCandidates('2026-08-16T08:00:00.000Z'),
    ).resolves.toEqual([]);
  });

  it('surfaces candidate query errors', async () => {
    queue({ data: null, error: new Error('candidates unavailable') });

    await expect(
      listSocialPublishCandidates('2026-08-16T08:00:00.000Z'),
    ).rejects.toThrow('candidates unavailable');
  });

  it('keeps only the latest scheduled time for each platform', async () => {
    queue({
      data: [
        { platform: 'x', scheduled_at: '2026-08-16T12:00:00.000Z' },
        { platform: 'threads', scheduled_at: '2026-08-16T11:00:00.000Z' },
        { platform: 'x', scheduled_at: '2026-08-16T10:00:00.000Z' },
      ],
      error: null,
    });

    await expect(latestScheduledSocialJobs()).resolves.toEqual({
      x: '2026-08-16T12:00:00.000Z',
      threads: '2026-08-16T11:00:00.000Z',
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
