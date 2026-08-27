import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));

vi.mock('@supabase/supabase-js', () => ({ createClient }));

import { loadSocialPerformance } from './social.js';

interface Post {
  id: string;
  episode_id: string;
  platform: string;
  post_url: string | null;
  published_at: string;
  topic: string;
  hook_type: string;
  published_title: string | null;
  published_body: string;
  hashtags: string[];
  review_status: string | null;
}

interface Metric {
  social_post_id: string;
  captured_at: string;
  age_hours: number;
  measurement_window: string | null;
  views: number | null;
  impressions: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  followers_gained: number | null;
  details: null;
}

interface Strategy {
  platform: string;
  config: {
    preferredHookTypes?: string[];
    preferredHashtags?: string[];
    avoidHashtags?: string[];
    publishSlotsJst?: Array<{ hour: number; minute: number }>;
  } | null;
}

const rows: Record<string, unknown[]> = {};
const config = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  SUPABASE_DB_SCHEMA: 'public',
} as Parameters<typeof loadSocialPerformance>[0]['config'];

function query(data: unknown[]) {
  const builder = {
    select: () => builder,
    gte: () => builder,
    order: () => builder,
    limit: () => builder,
    eq: () => builder,
    then: (resolve: (result: { data: unknown[]; error: null }) => unknown) =>
      Promise.resolve({ data, error: null }).then(resolve),
  };
  return builder;
}

async function decisions(
  posts: Post[],
  metrics: Metric[],
  strategies: Strategy[] = [],
) {
  rows['social_posts'] = posts;
  rows['social_post_metrics'] = metrics;
  rows['social_strategy_versions'] = strategies;
  return (
    await loadSocialPerformance({
      config,
      now: new Date('2026-08-28T00:00:00.000Z'),
    })
  ).decisions;
}

function post(id: string, overrides: Partial<Post> = {}): Post {
  return {
    id,
    episode_id: `episode-${id}`,
    platform: 'x',
    post_url: null,
    published_at: '2026-08-20T00:30:00.000Z',
    topic: 'default-topic',
    hook_type: 'question',
    published_title: `Title ${id}`,
    published_body: `Body ${id}`,
    hashtags: [],
    review_status: null,
    ...overrides,
  };
}

function metric(
  socialPostId: string,
  views: number | null,
  overrides: Partial<Metric> = {},
): Metric {
  return {
    social_post_id: socialPostId,
    captured_at: '2026-08-21T00:30:00.000Z',
    age_hours: 24,
    measurement_window: '24h',
    views,
    impressions: null,
    likes: null,
    comments: null,
    shares: null,
    saves: null,
    followers_gained: null,
    details: null,
    ...overrides,
  };
}

function topicSamples(
  topics: Record<string, number[]>,
  platform = 'x',
): { posts: Post[]; metrics: Metric[] } {
  const posts: Post[] = [];
  const metrics: Metric[] = [];
  for (const [topic, views] of Object.entries(topics)) {
    views.forEach((viewCount, index) => {
      const id = `${platform}-${topic}-${index}`;
      posts.push(
        post(id, {
          platform,
          topic,
          published_title: `${topic} post ${index + 1}`,
        }),
      );
      metrics.push(metric(id, viewCount));
    });
  }
  return { posts, metrics };
}

function strategy(
  platform: string,
  config: NonNullable<Strategy['config']> = {},
): Strategy {
  return { platform, config };
}

describe('buildDecisions', () => {
  beforeEach(() => {
    rows['social_posts'] = [];
    rows['social_post_metrics'] = [];
    rows['social_account_snapshots'] = [];
    rows['social_strategy_versions'] = [];
    createClient.mockReturnValue({
      from: (table: string) => query(rows[table] ?? []),
    });
  });

  it('does not call a topic best when only one bucket meets the sample floor', async () => {
    const samples = topicSamples({ alpha: [10, 20, 30], beta: [80, 90] });

    expect((await decisions(samples.posts, samples.metrics))[0]).toMatchObject({
      bestTopic: null,
      bestTopicSamples: null,
    });
  });

  it('selects the higher-median qualified topic and reports its sample count', async () => {
    const samples = topicSamples({
      alpha: [10, 20, 30],
      beta: [80, 100, 200],
    });

    expect((await decisions(samples.posts, samples.metrics))[0]).toMatchObject({
      bestTopic: 'beta',
      bestTopicSamples: 3,
      topExample: '“beta post 3” · 200 views',
    });
  });

  it('uses the current qualified 24h samples for evidence and confidence', async () => {
    const samples = topicSamples({ alpha: [10, 20, 30] });
    const firstId = samples.posts[0]!.id;
    const metrics = [
      ...samples.metrics,
      metric(firstId, 500, { measurement_window: '72h' }),
      metric(firstId, null),
    ];

    expect(
      (await decisions(samples.posts, metrics, [strategy('x')]))[0],
    ).toMatchObject({ evidenceSamples: 3, confidence: 'low' });
  });

  it('keeps rejected and effectively unseen Rednote posts out of evidence', async () => {
    const accepted = post('accepted', {
      platform: 'rednote',
      published_title: 'Accepted post',
    });
    const rejected = post('rejected', {
      platform: 'rednote',
      published_title: 'Rejected post',
      review_status: 'rejected',
    });
    const unseen = post('unseen', {
      platform: 'rednote',
      published_title: 'Unseen post',
    });

    expect(
      (
        await decisions(
          [accepted, rejected, unseen],
          [
            metric('accepted', 42),
            metric('rejected', 999),
            metric('unseen', 1),
          ],
        )
      )[0],
    ).toMatchObject({
      evidenceSamples: 1,
      topExample: '“Accepted post” · 42 views',
    });
  });

  it('formats configured publish slots in chronological order', async () => {
    const result = await decisions(
      [],
      [],
      [
        strategy('x', {
          publishSlotsJst: [
            { hour: 17, minute: 0 },
            { hour: 9, minute: 30 },
            { hour: 14, minute: 30 },
            { hour: 12, minute: 0 },
          ],
        }),
        strategy('threads'),
      ],
    );

    expect(result[0]?.publishSlotsJst).toBe('09:30 / 12:00 / 14:30 / 17:00');
    expect(result[1]?.publishSlotsJst).toBeNull();
  });

  it('omits empty platforms without a strategy but retains configured ones', async () => {
    expect(await decisions([], [], [])).toEqual([]);

    expect(await decisions([], [], [strategy('youtube')])).toEqual([
      expect.objectContaining({
        platform: 'youtube',
        evidenceSamples: 0,
        bestTopic: null,
        bestTopicSamples: null,
        publishSlotsJst: null,
        topExample: null,
      }),
    ]);
  });
});
