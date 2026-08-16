import { describe, expect, it } from 'vitest';

import type { SocialPostMetricRow, SocialPostRow } from '../types.js';
import {
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
  it('schedules the next configured JST slot and keeps platform minutes stable', () => {
    expect(
      nextPublishSlot({
        platform: 'x',
        readyAt: new Date('2026-08-16T08:00:00.000Z'),
        config: { publishHoursJst: [12, 19] },
      }).toISOString(),
    ).toBe('2026-08-16T10:05:00.000Z');

    expect(
      nextPublishSlot({
        platform: 'rednote',
        readyAt: new Date('2026-08-16T12:00:00.000Z'),
        after: new Date('2026-08-16T12:30:00.000Z'),
        config: { publishHoursJst: [20] },
      }).toISOString(),
    ).toBe('2026-08-17T11:25:00.000Z');
  });

  it('falls back to safe defaults when publish hours are invalid', () => {
    const strategy = defaultSocialStrategy('youtube');
    expect(strategy).toEqual({ publishHoursJst: [19], explorationRate: 0.2 });
    expect(
      nextPublishSlot({
        platform: 'youtube',
        readyAt: new Date('2026-08-16T00:00:00.000Z'),
        config: { publishHoursJst: [-1, 24, 1.5] },
      }).toISOString(),
    ).toBe('2026-08-16T10:35:00.000Z');
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
    expect(learned?.config.publishHoursJst).toContain(12);

    expect(
      learnSocialStrategies({
        posts: posts.slice(0, 4),
        metrics: metrics.slice(0, 4),
      }),
    ).toEqual([]);
  });
});
