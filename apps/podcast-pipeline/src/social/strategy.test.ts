import { describe, expect, it, vi } from 'vitest';

import type { SocialPostMetricRow, SocialPostRow } from '../types.js';
import {
  activeStrategyMap,
  buildStrategyGuidance,
  defaultSocialStrategy,
  learnSocialStrategies,
  policyStrategyLanes,
} from './strategy.js';

const POLICY_LANGUAGE = {
  rednote: 'zh-Hant',
  threads: 'ja',
  x: 'en',
  youtube: 'en',
} as const;

function post(input: {
  id: string;
  platform?: SocialPostRow['platform'];
  languageCode?: SocialPostRow['language_code'];
  publishedAt: string;
  hookType?: SocialPostRow['hook_type'];
  hashtags?: string[];
}): SocialPostRow {
  const platform = input.platform ?? 'rednote';
  return {
    id: input.id,
    episode_id: `episode-${input.id}`,
    platform,
    language_code: input.languageCode ?? POLICY_LANGUAGE[platform],
    post_url: null,
    platform_post_id: input.id,
    published_at: input.publishedAt,
    topic: 'macro',
    hook_type: input.hookType ?? 'question',
    generated_title: input.platform === 'rednote' ? '標題' : null,
    published_title: input.platform === 'rednote' ? '標題' : null,
    generated_body: 'generated',
    published_body: 'published',
    hashtags: input.hashtags ?? [],
    video_duration_sec: 120,
    content_features: {
      containsQuestion: input.hookType === 'question',
      containsNumber: input.hookType === 'surprising_number',
      titleChars: input.platform === 'rednote' ? 2 : null,
      bodyChars: 9,
      hashtagCount: input.hashtags?.length ?? 0,
    },
    llm_model: 'model',
    review_status: null,
    created_at: input.publishedAt,
    updated_at: input.publishedAt,
  };
}

function metric(input: {
  postId: string;
  views: number;
  likes?: number;
  retention?: number;
}): SocialPostMetricRow {
  return {
    id: `metric-${input.postId}`,
    social_post_id: input.postId,
    captured_at: '2026-08-17T12:00:00.000Z',
    age_hours: 24,
    measurement_window: '24h',
    views: input.views,
    impressions: null,
    likes: input.likes ?? 0,
    comments: 0,
    shares: 0,
    saves: 0,
    profile_visits: null,
    followers_gained: null,
    details: {
      ...(input.retention !== undefined
        ? { fiveSecondRetentionRate: input.retention }
        : {}),
    },
    created_at: '2026-08-17T12:00:00.000Z',
  };
}

describe('social strategy', () => {
  it('carries copy guidance only, never a schedule', () => {
    // Timing used to live here and was never read: the scheduler always used
    // its own defaults, so a learned row could not move a slot even in
    // principle. It is code-owned in policy.ts now.
    expect(defaultSocialStrategy()).toEqual({ explorationRate: 0.2 });
  });

  it('lists exactly the lanes the publish policy still ships', () => {
    expect(policyStrategyLanes()).toEqual([
      { platform: 'rednote', languageCode: 'zh-Hant' },
      { platform: 'threads', languageCode: 'en' },
      { platform: 'threads', languageCode: 'ja' },
      { platform: 'threads', languageCode: 'zh-Hant' },
      { platform: 'x', languageCode: 'en' },
      { platform: 'x', languageCode: 'ja' },
      { platform: 'x', languageCode: 'zh-Hant' },
      { platform: 'youtube', languageCode: 'en' },
      { platform: 'youtube', languageCode: 'ja' },
      { platform: 'youtube', languageCode: 'zh-Hant' },
    ]);
  });

  it('maps active rows by platform and fills absent platforms with null', () => {
    const rows = [
      {
        id: 'strategy-1',
        platform: 'x' as const,
        version: 1,
        config: defaultSocialStrategy(),
        based_on_samples: 5,
        active: true,
        activated_at: '2026-08-16T00:00:00.000Z',
        created_at: '2026-08-16T00:00:00.000Z',
      },
    ];

    expect(activeStrategyMap(rows)).toEqual(
      expect.objectContaining({
        x: rows[0],
        threads: null,
        rednote: null,
        youtube: null,
        'x|zh-Hant': rows[0],
        'x|ja': null,
        'x|en': null,
      }),
    );
  });

  it('returns no guidance for missing or empty preferences', () => {
    expect(buildStrategyGuidance('x', undefined)).toBeUndefined();
    expect(buildStrategyGuidance('x', {})).toBeUndefined();
    expect(
      buildStrategyGuidance('rednote', { avoidHashtags: ['弱標籤'] }),
    ).toContain('弱標籤');
  });

  it('turns learned hook and hashtag preferences into soft prompt guidance', () => {
    expect(
      buildStrategyGuidance('rednote', {
        preferredHookTypes: ['question'],
        preferredHashtags: ['AI', '聯準會'],
        avoidHashtags: ['冷門'],
      }),
    ).toContain('question');
    expect(
      buildStrategyGuidance('rednote', {
        preferredHashtags: ['AI'],
      }),
    ).toContain('AI');
    expect(
      buildStrategyGuidance('x', { preferredHashtags: ['AI'] }),
    ).toBeUndefined();
  });

  it('explores by dropping preferred lines while always keeping the avoid line', () => {
    const config = {
      preferredHookTypes: ['question'] as const,
      preferredHashtags: ['AI'],
      avoidHashtags: ['冷門'],
      explorationRate: 0.2,
    };

    const exploiting = buildStrategyGuidance(
      'rednote',
      { ...config, preferredHookTypes: [...config.preferredHookTypes] },
      () => 0.9,
    );
    expect(exploiting).toContain('question');
    expect(exploiting).toContain('AI');
    expect(exploiting).toContain('冷門');

    const exploring = buildStrategyGuidance(
      'rednote',
      { ...config, preferredHookTypes: [...config.preferredHookTypes] },
      () => 0.1,
    );
    expect(exploring).not.toContain('question');
    expect(exploring).not.toContain('AI');
    expect(exploring).toContain('冷門');

    expect(
      buildStrategyGuidance(
        'rednote',
        { preferredHashtags: ['AI'], explorationRate: 1 },
        () => 0.5,
      ),
    ).toBeUndefined();
  });

  it('freezes preferred packaging bias while preserving avoid guidance', () => {
    const random = vi.fn(() => 0);
    expect(
      buildStrategyGuidance(
        'rednote',
        {
          preferredHookTypes: ['question'],
          preferredHashtags: ['強標籤'],
          avoidHashtags: ['弱標籤'],
          explorationRate: 1,
        },
        random,
        { packagingActive: true },
      ),
    ).toBe(
      'Avoid these historically weak hashtags unless they are essential to the topic: 弱標籤.',
    );
    expect(random).not.toHaveBeenCalled();
  });

  it('scores zero-view samples safely and learns non-Rednote platforms without hashtag rules', () => {
    const posts = Array.from({ length: 5 }, (_value, index) =>
      post({
        id: `threads-${index}`,
        platform: 'threads',
        publishedAt: `2026-08-${String(10 + index).padStart(2, '0')}T03:00:00.000Z`,
        hookType: index < 3 ? 'question' : 'surprising_number',
        hashtags: ['ignored-on-threads'],
      }),
    );
    const metrics = [
      metric({ postId: 'threads-0', views: 0 }),
      metric({ postId: 'threads-1', views: 0 }),
      metric({ postId: 'threads-2', views: 0 }),
      metric({ postId: 'threads-3', views: 10, likes: 2 }),
      metric({ postId: 'threads-4', views: 20, retention: 0.5 }),
    ];

    const [learned] = learnSocialStrategies({ posts, metrics });
    expect(learned).toMatchObject({
      platform: 'threads',
      languageCode: 'ja',
      basedOnSamples: 5,
    });
    expect(learned?.config.preferredHashtags).toBeUndefined();
    expect(learned?.config.avoidHashtags).toBeUndefined();
  });

  it('uses the average middle pair when learning from an even number of samples', () => {
    const posts = Array.from({ length: 6 }, (_value, index) =>
      post({
        id: `even-${index}`,
        platform: 'x',
        publishedAt: '2026-08-15T03:00:00.000Z',
        hookType: index < 3 ? 'question' : 'surprising_number',
      }),
    );
    const metrics = posts.map((row, index) =>
      metric({ postId: row.id, views: (index + 1) * 100 }),
    );

    expect(learnSocialStrategies({ posts, metrics })[0]).toMatchObject({
      platform: 'x',
      basedOnSamples: 6,
    });
  });

  it('ignores orphan, null-view, and non-24h metric samples', () => {
    const posts = Array.from({ length: 5 }, (_value, index) =>
      post({
        id: `x-${index}`,
        platform: 'x',
        publishedAt: '2026-08-15T03:00:00.000Z',
      }),
    );
    const valid = posts.map((row) => metric({ postId: row.id, views: 100 }));
    const metrics: SocialPostMetricRow[] = [
      ...valid,
      {
        ...metric({ postId: 'missing', views: 100 }),
        social_post_id: 'missing',
      },
      {
        ...metric({ postId: 'x-0', views: 100 }),
        id: 'null-view',
        views: null,
      },
      {
        ...metric({ postId: 'x-1', views: 100 }),
        id: 'wrong-window',
        measurement_window: '1h',
      },
    ];

    expect(learnSocialStrategies({ posts, metrics })[0]).toMatchObject({
      platform: 'x',
      basedOnSamples: 5,
    });
  });

  it('learns only from standardized 24h samples and requires enough evidence', () => {
    const posts = [
      post({
        id: '1',
        publishedAt: '2026-08-15T03:00:00.000Z',
        hashtags: ['AI', '宏觀'],
        hookType: 'question',
      }),
      post({
        id: '2',
        publishedAt: '2026-08-14T03:00:00.000Z',
        hashtags: ['AI', '宏觀'],
        hookType: 'question',
      }),
      post({
        id: '3',
        publishedAt: '2026-08-13T11:00:00.000Z',
        hashtags: ['冷門', '市場'],
        hookType: 'surprising_number',
      }),
      post({
        id: '4',
        publishedAt: '2026-08-12T11:00:00.000Z',
        hashtags: ['冷門', '市場'],
        hookType: 'surprising_number',
      }),
      post({
        id: '5',
        publishedAt: '2026-08-11T03:00:00.000Z',
        hashtags: ['AI', '市場'],
        hookType: 'question',
      }),
    ];
    const metrics = [
      metric({ postId: '1', views: 2000, likes: 100, retention: 0.8 }),
      metric({ postId: '2', views: 1800, likes: 90, retention: 0.75 }),
      metric({ postId: '3', views: 300, likes: 3, retention: 0.2 }),
      metric({ postId: '4', views: 250, likes: 2, retention: 0.15 }),
      metric({ postId: '5', views: 1600, likes: 80, retention: 0.7 }),
      {
        ...metric({ postId: '1', views: 999999 }),
        id: 'metric-latest',
        measurement_window: null,
      },
    ];

    const [learned] = learnSocialStrategies({ posts, metrics });
    expect(learned).toMatchObject({ platform: 'rednote', basedOnSamples: 5 });
    expect(learned?.config.preferredHookTypes).toContain('question');
    expect(learned?.config.preferredHashtags).toContain('AI');
    expect(learned?.config.avoidHashtags).toContain('冷門');
    // Nothing about timing: a learned row cannot move a slot or widen a cap.
    expect(Object.keys(learned!.config).sort()).toEqual([
      'avoidHashtags',
      'explorationRate',
      'preferredHashtags',
      'preferredHookTypes',
    ]);

    expect(
      learnSocialStrategies({
        posts: posts.slice(0, 4),
        metrics: metrics.slice(0, 4),
      }),
    ).toEqual([]);
  });

  it('never ranks the same hashtag as both preferred and avoided', () => {
    const tagsByIndex = [['A', 'B'], ['A', 'B'], ['B'], ['B'], ['C'], ['C']];
    const viewsByIndex = [1000, 1000, 500, 500, 10, 10];
    const posts = tagsByIndex.map((hashtags, index) =>
      post({
        id: `overlap-${index}`,
        publishedAt: '2026-08-15T03:00:00.000Z',
        hashtags,
      }),
    );
    const metrics = posts.map((row, index) =>
      metric({ postId: row.id, views: viewsByIndex[index] ?? 0 }),
    );

    const [learned] = learnSocialStrategies({ posts, metrics });
    expect(learned?.config.preferredHashtags).toEqual(['A', 'B']);
    expect(learned?.config.avoidHashtags).toEqual(['C']);
  });

  it('drops Rednote samples the platform suppressed instead of learning from their zeros', () => {
    const clean = Array.from({ length: 5 }, (_value, index) =>
      post({
        id: `clean-${index}`,
        publishedAt: '2026-08-15T03:00:00.000Z',
        hashtags: ['支付產業', '市場結構'],
      }),
    );
    const suppressed = (
      [
        ['rejected', 'rejected'],
        ['held', 'under_review'],
        ['private', 'self_only'],
      ] as const
    ).map(([id, reviewStatus]) => ({
      ...post({
        id,
        publishedAt: '2026-08-15T03:00:00.000Z',
        hashtags: ['穩定幣'],
      }),
      review_status: reviewStatus,
    }));
    const posts = [...clean, ...suppressed];
    const metrics = [
      ...clean.map((row) => metric({ postId: row.id, views: 120, likes: 6 })),
      ...suppressed.map((row) => metric({ postId: row.id, views: 0 })),
    ];

    const [learned] = learnSocialStrategies({ posts, metrics });
    expect(learned).toMatchObject({ platform: 'rednote', basedOnSamples: 5 });
    expect(learned?.config.preferredHashtags).not.toContain('穩定幣');
    expect(learned?.config.avoidHashtags).not.toContain('穩定幣');
  });

  it('floors unobserved Rednote rows at more than one view but keeps quiet X posts', () => {
    const rednotePosts = Array.from({ length: 6 }, (_value, index) =>
      post({
        id: `floor-${index}`,
        publishedAt: '2026-08-15T03:00:00.000Z',
        hashtags: index < 5 ? ['支付產業'] : ['歸零標籤'],
      }),
    );
    const rednoteMetrics = rednotePosts.map((row, index) =>
      metric({ postId: row.id, views: index < 5 ? 120 : 1 }),
    );
    const [rednote] = learnSocialStrategies({
      posts: rednotePosts,
      metrics: rednoteMetrics,
    });
    expect(rednote).toMatchObject({ platform: 'rednote', basedOnSamples: 5 });

    const xPosts = Array.from({ length: 5 }, (_value, index) =>
      post({
        id: `x-floor-${index}`,
        platform: 'x',
        publishedAt: '2026-08-15T03:00:00.000Z',
      }),
    );
    const [x] = learnSocialStrategies({
      posts: xPosts,
      metrics: xPosts.map((row) => metric({ postId: row.id, views: 0 })),
    });
    expect(x).toMatchObject({ platform: 'x', basedOnSamples: 5 });
  });
});
