import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SocialPostMetricRow, SocialPostRow } from '../types.js';

const store = vi.hoisted(() => ({
  activateSocialStrategy: vi.fn(),
  getActiveSocialStrategies: vi.fn(),
  listLearningSocialMetrics: vi.fn(),
  listLearningSocialPosts: vi.fn(),
}));

vi.mock('./daemon-store.js', () => ({
  ...store,
}));

import {
  defaultSocialStrategy,
  learnSocialStrategies,
  refreshSocialStrategies,
} from './strategy.js';

function post(
  id: string,
  hookType: SocialPostRow['hook_type'] = 'question',
): SocialPostRow {
  const publishedAt = `2026-08-${String(10 + Number(id)).padStart(2, '0')}T03:00:00.000Z`;
  return {
    id,
    episode_id: `episode-${id}`,
    platform: 'rednote',
    post_url: null,
    platform_post_id: id,
    published_at: publishedAt,
    topic: 'macro',
    hook_type: hookType,
    generated_title: '標題',
    published_title: '標題',
    generated_body: 'generated',
    published_body: 'published',
    hashtags: hookType === 'question' ? ['AI', 'macro'] : ['weak', 'macro'],
    video_duration_sec: 120,
    content_features: {
      containsQuestion: hookType === 'question',
      containsNumber: hookType === 'surprising_number',
      titleChars: 2,
      bodyChars: 9,
      hashtagCount: 2,
    },
    llm_model: 'model',
    review_status: null,
    created_at: publishedAt,
    updated_at: publishedAt,
  };
}

function metric(postId: string, views: number): SocialPostMetricRow {
  return {
    id: `metric-${postId}`,
    social_post_id: postId,
    captured_at: '2026-08-17T12:00:00.000Z',
    age_hours: 24,
    measurement_window: '24h',
    views,
    impressions: null,
    likes: views > 0 ? 10 : null,
    comments: views > 0 ? 2 : null,
    shares: views > 0 ? 1 : null,
    saves: views > 0 ? 1 : null,
    profile_visits: null,
    followers_gained: null,
    details: views > 0 ? { fiveSecondRetentionRate: 0.5 } : {},
    created_at: '2026-08-17T12:00:00.000Z',
  };
}

function learningSet() {
  const posts = [
    post('1'),
    post('2'),
    post('3'),
    post('4', 'surprising_number'),
    post('5', 'surprising_number'),
  ];
  const metrics = [
    metric('1', 1000),
    metric('2', 900),
    metric('3', 800),
    metric('4', 100),
    metric('5', 50),
  ];
  return { posts, metrics };
}

beforeEach(() => {
  vi.clearAllMocks();
  const { posts, metrics } = learningSet();
  store.listLearningSocialPosts.mockResolvedValue(posts);
  store.listLearningSocialMetrics.mockResolvedValue(metrics);
  store.getActiveSocialStrategies.mockResolvedValue([]);
  store.activateSocialStrategy.mockImplementation(async (input) => ({
    id: 'strategy-new',
    platform: input.platform,
    version: 2,
    config: input.config,
    based_on_samples: input.basedOnSamples,
    active: true,
    created_at: input.now.toISOString(),
  }));
});

describe('refreshSocialStrategies', () => {
  it('loads the learning window, activates a changed strategy, and logs the version', async () => {
    const log = vi.fn();
    const now = new Date('2026-08-17T12:00:00.000Z');

    await refreshSocialStrategies({ now, log });

    expect(store.listLearningSocialPosts).toHaveBeenCalledWith(
      '2026-06-18T12:00:00.000Z',
    );
    expect(store.listLearningSocialMetrics).toHaveBeenCalledWith(
      '2026-06-18T12:00:00.000Z',
    );
    expect(store.activateSocialStrategy).toHaveBeenCalledOnce();
    expect(store.activateSocialStrategy).toHaveBeenCalledWith(
      expect.objectContaining({
        platform: 'rednote',
        basedOnSamples: 5,
        now,
      }),
    );
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining(
        '🧠 [strategy] 📕 rednote 🇹🇼 zh-Hant · activated v2 · 5 × 24h samples',
      ),
    );
  });

  it('activates when an existing strategy has a stale sparse config', async () => {
    store.getActiveSocialStrategies.mockResolvedValue([
      {
        id: 'strategy-stale',
        platform: 'rednote',
        version: 1,
        config: {},
        based_on_samples: 1,
        active: true,
        created_at: '2026-08-16T00:00:00.000Z',
      },
    ]);

    await refreshSocialStrategies({
      now: new Date('2026-08-17T12:00:00.000Z'),
      log: vi.fn(),
    });

    expect(store.activateSocialStrategy).toHaveBeenCalledOnce();
    expect(store.activateSocialStrategy).toHaveBeenCalledWith(
      expect.objectContaining({ platform: 'rednote', basedOnSamples: 5 }),
    );
  });

  it('skips activation when the active strategy is canonically equivalent', async () => {
    const { posts, metrics } = learningSet();
    const [learned] = learnSocialStrategies({ posts, metrics });
    if (!learned) throw new Error('expected learned strategy');
    store.getActiveSocialStrategies.mockResolvedValue([
      {
        id: 'strategy-existing',
        platform: 'rednote',
        version: 1,
        config: {
          publishSlotsJst: [
            ...(learned.config.publishSlotsJst ?? []),
          ].reverse(),
          preferredHookTypes: [
            ...(learned.config.preferredHookTypes ?? []),
          ].reverse(),
          preferredHashtags: [
            ...(learned.config.preferredHashtags ?? []),
          ].reverse(),
          avoidHashtags: [...(learned.config.avoidHashtags ?? [])].reverse(),
          explorationRate: learned.config.explorationRate,
        },
        based_on_samples: 5,
        active: true,
        created_at: '2026-08-16T00:00:00.000Z',
      },
    ]);

    await refreshSocialStrategies({
      now: new Date('2026-08-17T12:00:00.000Z'),
      log: vi.fn(),
    });

    expect(store.activateSocialStrategy).not.toHaveBeenCalled();
  });

  it('supports the default no-op logger and no learned strategies', async () => {
    store.listLearningSocialPosts.mockResolvedValue([]);
    store.listLearningSocialMetrics.mockResolvedValue([]);
    store.getActiveSocialStrategies.mockResolvedValue([
      {
        id: 'x-default',
        platform: 'x',
        version: 1,
        config: defaultSocialStrategy(),
        based_on_samples: 0,
        active: true,
        created_at: '2026-08-16T00:00:00.000Z',
      },
    ]);

    await expect(
      refreshSocialStrategies({ now: new Date('2026-08-17T12:00:00.000Z') }),
    ).resolves.toBeUndefined();
    expect(store.activateSocialStrategy).not.toHaveBeenCalled();
  });
});
