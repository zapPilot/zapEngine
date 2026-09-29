import { describe, expect, it, vi } from 'vitest';

import type { SocialPostRow } from '../types.js';
import {
  collectRollingPostMetrics,
  isRollingMetricCandidate,
} from './rolling-metrics.js';

const NOW = new Date('2026-08-30T12:00:00.000Z');

describe('rolling social metrics', () => {
  it('collects only recent posts on captured platforms and writes NULL-window rows', async () => {
    const insertMetric = vi.fn().mockResolvedValue(undefined);
    const collectX = vi.fn().mockResolvedValue({
      status: 'collected',
      metrics: counts({ views: 12, likes: 2 }),
    });
    const collectThreads = vi.fn();
    const collectRednote = vi.fn();
    const collectYoutube = vi.fn();
    await expect(
      collectRollingPostMetrics({
        now: NOW,
        platforms: ['x'],
        browser: { close: vi.fn() } as never,
        listPosts: vi
          .fn()
          .mockResolvedValue([
            post('recent-x', 'x', 47),
            post('old-x', 'x', 49),
            post('recent-threads', 'threads', 1),
          ]),
        collectors: {
          x: collectX,
          threads: collectThreads,
          rednote: collectRednote,
          youtube: collectYoutube,
        },
        insertMetric,
      }),
    ).resolves.toBe(1);

    expect(collectX).toHaveBeenCalledOnce();
    expect(collectX).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'recent-x' }),
    );
    expect(collectThreads).not.toHaveBeenCalled();
    expect(insertMetric).toHaveBeenCalledWith(
      expect.objectContaining({
        socialPostId: 'recent-x',
        collectionStatus: 'collected',
        views: 12,
      }),
    );
    expect(insertMetric.mock.calls[0]?.[0]).not.toHaveProperty(
      'measurementWindow',
    );
  });

  it.each(['retryable', 'unavailable'] as const)(
    'writes nothing for %s collection results',
    async (status) => {
      const insertMetric = vi.fn();
      await collectRollingPostMetrics({
        now: NOW,
        platforms: ['rednote'],
        browser: { close: vi.fn() } as never,
        listPosts: vi.fn().mockResolvedValue([post('post-1', 'rednote', 1)]),
        collectors: {
          x: vi.fn(),
          threads: vi.fn(),
          youtube: vi.fn(),
          rednote: vi.fn().mockResolvedValue({ status, reason: 'not ready' }),
        },
        insertMetric,
      });
      expect(insertMetric).not.toHaveBeenCalled();
    },
  );

  it('returns early when only YouTube is requested or no recent post is eligible', async () => {
    const listPosts = vi.fn().mockResolvedValue([post('old-x', 'x', 49)]);

    await expect(
      collectRollingPostMetrics({
        now: NOW,
        platforms: ['youtube'],
        listPosts,
      }),
    ).resolves.toBe(0);
    expect(listPosts).not.toHaveBeenCalled();

    await expect(
      collectRollingPostMetrics({ now: NOW, platforms: ['x'], listPosts }),
    ).resolves.toBe(0);
    expect(listPosts).toHaveBeenCalledOnce();
  });

  it('logs collector failures and continues with later posts', async () => {
    const log = vi.fn();
    const insertMetric = vi.fn().mockResolvedValue(undefined);
    const collectX = vi
      .fn()
      .mockRejectedValueOnce(new Error('metrics unavailable'))
      .mockResolvedValueOnce({
        status: 'collected',
        metrics: counts({ views: 8 }),
      });

    await expect(
      collectRollingPostMetrics({
        now: NOW,
        platforms: ['x'],
        listPosts: vi
          .fn()
          .mockResolvedValue([post('bad-x', 'x', 1), post('good-x', 'x', 2)]),
        collectors: {
          x: collectX,
          threads: vi.fn(),
          rednote: vi.fn(),
          youtube: vi.fn(),
        },
        insertMetric,
        log,
      }),
    ).resolves.toBe(1);

    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('rolling metrics failed · post=bad-x'),
    );
    expect(log).toHaveBeenCalledWith(
      '📈 [social-daemon] rolling metrics · 1 collected',
    );
  });

  it('covers every rolling-candidate boundary', () => {
    const platforms = new Set<SocialPostRow['platform']>(['x']);
    expect(isRollingMetricCandidate(post('now', 'x', 0), NOW, platforms)).toBe(
      true,
    );
    expect(
      isRollingMetricCandidate(post('boundary', 'x', 48), NOW, platforms),
    ).toBe(true);
    expect(
      isRollingMetricCandidate(post('old', 'x', 48.01), NOW, platforms),
    ).toBe(false);
    expect(
      isRollingMetricCandidate(post('wrong', 'threads', 1), NOW, platforms),
    ).toBe(false);
    expect(
      isRollingMetricCandidate(
        { ...post('invalid', 'x', 1), published_at: 'not-a-date' },
        NOW,
        platforms,
      ),
    ).toBe(false);
    expect(
      isRollingMetricCandidate(
        {
          ...post('future', 'x', 1),
          published_at: new Date(NOW.getTime() + 1).toISOString(),
        },
        NOW,
        platforms,
      ),
    ).toBe(false);
  });
});

function post(
  id: string,
  platform: SocialPostRow['platform'],
  ageHours: number,
): SocialPostRow {
  return {
    id,
    platform,
    published_at: new Date(NOW.getTime() - ageHours * 3_600_000).toISOString(),
  } as SocialPostRow;
}

function counts(overrides: Record<string, number>) {
  return {
    views: null,
    impressions: null,
    likes: null,
    comments: null,
    shares: null,
    saves: null,
    profileVisits: null,
    followersGained: null,
    ...overrides,
  };
}
