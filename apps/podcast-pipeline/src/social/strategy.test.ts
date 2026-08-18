import { describe, expect, it } from 'vitest';

import type { SocialPostMetricRow, SocialPostRow } from '../types.js';
import {
  activeStrategyMap,
  buildStrategyGuidance,
  defaultSocialStrategy,
  learnSocialStrategies,
  nextPublishSlot,
} from './strategy.js';

function post(input: {
  id: string;
  platform?: SocialPostRow['platform'];
  publishedAt: string;
  hookType?: SocialPostRow['hook_type'];
  hashtags?: string[];
}): SocialPostRow {
  return {
    id: input.id,
    episode_id: `episode-${input.id}`,
    platform: input.platform ?? 'rednote',
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
  it('schedules the next configured JST slot for every platform', () => {
    expect(
      nextPublishSlot({
        platform: 'x',
        readyAt: new Date('2026-08-16T08:00:00.000Z'),
        config: {
          publishSlotsJst: [
            { hour: 12, minute: 0 },
            { hour: 19, minute: 0 },
          ],
        },
      }).toISOString(),
    ).toBe('2026-08-16T10:00:00.000Z');

    expect(
      nextPublishSlot({
        platform: 'rednote',
        readyAt: new Date('2026-08-16T12:00:00.000Z'),
        after: new Date('2026-08-16T12:30:00.000Z'),
        config: { publishSlotsJst: [{ hour: 20, minute: 0 }] },
      }).toISOString(),
    ).toBe('2026-08-17T11:00:00.000Z');
  });

  it('falls back to safe defaults when publish slots are invalid', () => {
    const strategy = defaultSocialStrategy();
    expect(strategy).toEqual({
      publishSlotsJst: [
        { hour: 9, minute: 30 },
        { hour: 12, minute: 0 },
        { hour: 14, minute: 30 },
        { hour: 17, minute: 0 },
      ],
      explorationRate: 0.2,
    });
    expect(
      nextPublishSlot({
        platform: 'youtube',
        readyAt: new Date('2026-08-16T00:00:00.000Z'),
        config: {
          publishSlotsJst: [
            { hour: -1, minute: 0 },
            { hour: 24, minute: 0 },
            { hour: 1, minute: 90 },
          ],
        },
      }).toISOString(),
    ).toBe('2026-08-16T00:30:00.000Z');
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

    expect(activeStrategyMap(rows)).toEqual({
      x: rows[0],
      threads: null,
      rednote: null,
      youtube: null,
    });
  });

  it('uses default schedule configuration when no strategy config or publish slots are supplied', () => {
    const input = {
      platform: 'threads' as const,
      readyAt: new Date('2026-08-16T00:00:00.000Z'),
    };
    expect(nextPublishSlot(input).toISOString()).toBe(
      '2026-08-16T00:30:00.000Z',
    );
    expect(nextPublishSlot({ ...input, config: {} }).toISOString()).toBe(
      '2026-08-16T00:30:00.000Z',
    );
  });

  it('keeps every default publish slot inside the 9:30-18:00 JST work window', () => {
    const readyAt = new Date('2026-08-16T00:00:00.000Z');
    for (const platform of ['x', 'threads', 'rednote', 'youtube'] as const) {
      let after: Date | undefined;
      for (let index = 0; index < 4; index += 1) {
        const slot = nextPublishSlot({ platform, readyAt, after });
        const jstMinutes =
          ((slot.getTime() + 9 * 60 * 60_000) % (24 * 60 * 60_000)) / 60_000;
        expect(jstMinutes).toBeGreaterThanOrEqual(9 * 60 + 30);
        expect(jstMinutes).toBeLessThanOrEqual(18 * 60);
        after = new Date(slot.getTime() + 60_000);
      }
    }
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
    expect(learned).toMatchObject({ platform: 'threads', basedOnSamples: 5 });
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
    expect(learned?.config.publishSlotsJst).toEqual(
      defaultSocialStrategy().publishSlotsJst,
    );

    expect(
      learnSocialStrategies({
        posts: posts.slice(0, 4),
        metrics: metrics.slice(0, 4),
      }),
    ).toEqual([]);
  });
});
