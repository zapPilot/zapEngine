import { beforeEach, describe, expect, it, vi } from 'vitest';

const supabaseMocks = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock('../services/supabase-client.js', () => ({
  getPipelineSupabase: () => ({ from: supabaseMocks.from }),
  throwSupabaseError: (error: unknown) => {
    throw error;
  },
}));

import {
  deterministicBucket,
  deterministicVariant,
  getOrCreateExperimentAssignment,
} from './experiments.js';

beforeEach(() => vi.clearAllMocks());

describe('social experiment assignment', () => {
  it('is deterministic for an experiment and episode', () => {
    expect(deterministicVariant('x-language-v1', 'episode-1')).toBe(
      deterministicVariant('x-language-v1', 'episode-1'),
    );
  });

  it('stays close to a 50/50 split over a broad cohort', () => {
    const variants = Array.from({ length: 10_000 }, (_, index) =>
      deterministicVariant('x-language-v1', `episode-${index}`),
    );
    const english = variants.filter((variant) => variant === 'en').length;
    expect(english / variants.length).toBeGreaterThan(0.48);
    expect(english / variants.length).toBeLessThan(0.52);
  });

  it('rejects invalid bucket counts', () => {
    expect(() => deterministicBucket('exp', 'episode', 0)).toThrow(
      'bucketCount must be a positive integer',
    );
    expect(() => deterministicBucket('exp', 'episode', 1.5)).toThrow(
      'bucketCount must be a positive integer',
    );
  });

  it('surfaces insert and select failures', async () => {
    const insertFailure = new Error('insert failed');
    const failingUpsert = vi.fn().mockResolvedValue({ error: insertFailure });
    supabaseMocks.from.mockReturnValueOnce({ upsert: failingUpsert });

    await expect(
      getOrCreateExperimentAssignment({
        experimentKey: 'x-language-v1',
        episodeId: 'episode-1',
      }),
    ).rejects.toBe(insertFailure);

    const upsert = vi.fn().mockResolvedValue({ error: null });
    const selectFailure = new Error('select failed');
    const single = vi
      .fn()
      .mockResolvedValue({ data: null, error: selectFailure });
    const secondEq = vi.fn(() => ({ single }));
    const firstEq = vi.fn(() => ({ eq: secondEq }));
    const select = vi.fn(() => ({ eq: firstEq }));
    supabaseMocks.from
      .mockReturnValueOnce({ upsert })
      .mockReturnValueOnce({ select });

    await expect(
      getOrCreateExperimentAssignment({
        experimentKey: 'x-language-v1',
        episodeId: 'episode-2',
      }),
    ).rejects.toBe(selectFailure);
  });

  it('uses the persisted row as authority when it differs from the first hash', async () => {
    const persisted = {
      experiment_key: 'x-language-v1',
      episode_id: 'episode-1',
      variant:
        deterministicVariant('x-language-v1', 'episode-1') === 'en'
          ? 'ja'
          : 'en',
      assigned_at: '2026-08-24T00:00:00.000Z',
    };
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const single = vi.fn().mockResolvedValue({ data: persisted, error: null });
    const secondEq = vi.fn(() => ({ single }));
    const firstEq = vi.fn(() => ({ eq: secondEq }));
    const select = vi.fn(() => ({ eq: firstEq }));
    supabaseMocks.from
      .mockReturnValueOnce({ upsert })
      .mockReturnValueOnce({ select });

    await expect(
      getOrCreateExperimentAssignment({
        experimentKey: 'x-language-v1',
        episodeId: 'episode-1',
      }),
    ).resolves.toEqual(persisted);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: deterministicVariant('x-language-v1', 'episode-1'),
      }),
      expect.objectContaining({ ignoreDuplicates: true }),
    );
  });
});
