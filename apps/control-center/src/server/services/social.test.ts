import { describe, expect, it } from 'vitest';

import { buildDecisions } from './social.js';

type Post = Parameters<typeof buildDecisions>[0][number];
type Metric = Parameters<typeof buildDecisions>[1][number];
type Strategy = Parameters<typeof buildDecisions>[2][number];

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
  it('does not call a topic best when only one bucket meets the sample floor', () => {
    const samples = topicSamples({ alpha: [10, 20, 30], beta: [80, 90] });

    expect(buildDecisions(samples.posts, samples.metrics, [])[0]).toMatchObject(
      {
        bestTopic: null,
        bestTopicSamples: null,
        bestTopicMedian24hViews: null,
        platformMedian24hViews: 30,
        bestTopicLiftVsPlatformMedian: null,
      },
    );
  });

  it('selects the higher-median qualified topic and quantifies its lift', () => {
    const samples = topicSamples({
      alpha: [10, 20, 30],
      beta: [80, 100, 200],
    });

    const decision = buildDecisions(samples.posts, samples.metrics, [])[0]!;
    expect(decision).toMatchObject({
      bestTopic: 'beta',
      bestTopicSamples: 3,
      bestTopicMedian24hViews: 100,
      platformMedian24hViews: 55,
      topExample: '“beta post 3” · 200 views',
    });
    expect(decision.bestTopicLiftVsPlatformMedian).toBeCloseTo(100 / 55);
  });

  it('uses the current qualified 24h samples for evidence and confidence', () => {
    const samples = topicSamples({ alpha: [10, 20, 30] });
    const firstId = samples.posts[0]!.id;
    const metrics = [
      ...samples.metrics,
      metric(firstId, 500, { measurement_window: '72h' }),
      metric(firstId, null),
    ];

    expect(
      buildDecisions(samples.posts, metrics, [strategy('x')])[0],
    ).toMatchObject({
      evidenceSamples: 3,
      confidence: 'low',
      platformMedian24hViews: 20,
    });
  });

  it('keeps rejected and effectively unseen Rednote posts out of evidence', () => {
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
      buildDecisions(
        [accepted, rejected, unseen],
        [metric('accepted', 42), metric('rejected', 999), metric('unseen', 1)],
        [],
      )[0],
    ).toMatchObject({
      evidenceSamples: 1,
      platformMedian24hViews: 42,
      topExample: '“Accepted post” · 42 views',
    });
  });

  it('formats configured publish slots in chronological order', () => {
    const decisions = buildDecisions(
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

    expect(decisions[0]?.publishSlotsJst).toBe('09:30 / 12:00 / 14:30 / 17:00');
    expect(decisions[1]?.publishSlotsJst).toBeNull();
  });

  it('omits empty platforms without a strategy but retains configured ones', () => {
    expect(buildDecisions([], [], [])).toEqual([]);

    expect(buildDecisions([], [], [strategy('youtube')])).toEqual([
      expect.objectContaining({
        platform: 'youtube',
        evidenceSamples: 0,
        bestTopic: null,
        bestTopicSamples: null,
        bestTopicMedian24hViews: null,
        platformMedian24hViews: null,
        bestTopicLiftVsPlatformMedian: null,
        publishSlotsJst: null,
        topExample: null,
      }),
    ]);
  });
});
