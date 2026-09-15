import { describe, expect, it, vi } from 'vitest';

import { readControlCenterConfig } from '../config/env.js';
import {
  buildDecisions,
  buildEpisodes,
  loadSocialPerformance,
} from './social.js';

const serviceRole = vi.hoisted(() => ({ client: null as unknown }));

vi.mock('./supabase.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./supabase.js')>();
  return {
    ...actual,
    createServiceRoleClient: vi.fn(() => serviceRole.client),
  };
});

function post(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    episode_id: `episode-${id}`,
    platform: 'x',
    language_code: 'en',
    post_url: null,
    published_at: '2026-08-20T00:30:00.000Z',
    topic: 't',
    hook_type: 'q',
    published_title: `Title ${id}`,
    published_body: `Body ${id}\nsecond`,
    hashtags: [],
    review_status: null,
    ...overrides,
  };
}

function metric(id: string, views: number | null, overrides: Record<string, unknown> = {}) {
  return {
    social_post_id: id,
    captured_at: '2026-08-21T00:30:00.000Z',
    age_hours: 24,
    measurement_window: '24h',
    collection_status: 'collected',
    views,
    impressions: null,
    likes: 1,
    comments: 1,
    shares: 1,
    saves: 1,
    followers_gained: null,
    details: null,
    ...overrides,
  };
}

function okClient() {
  return {
    from: (table: string) => {
      const data =
        table === 'social_posts'
          ? [post('p1')]
          : table === 'social_post_metrics'
            ? [metric('p1', 10, { impressions: 100, likes: 2 })]
            : table === 'social_account_snapshots'
              ? [
                  { platform: 'x', followers: 5, captured_at: '2026-08-21T00:00:00Z' },
                  { platform: 'x', followers: 6, captured_at: '2026-08-20T00:00:00Z' },
                ]
              : table === 'social_strategy_versions'
                ? [{ platform: 'x', config: { preferredHookTypes: ['q'] } }]
                : [];
      const chain: Record<string, unknown> = {};
      for (const m of ['select', 'gte', 'order', 'limit', 'eq', 'not'])
        chain[m] = () => chain;
      chain['then'] = (ok: (v: unknown) => unknown) =>
        Promise.resolve({ data, error: null }).then(ok);
      return chain;
    },
  };
}

describe('social coverage', () => {
  it('returns unconfigured without Supabase', async () => {
    const res = await loadSocialPerformance({
      config: readControlCenterConfig({}),
      now: new Date('2026-08-22T00:00:00Z'),
    });
    expect(res.status).toBe('unconfigured');
    expect(res.accounts).toEqual([]);
  });

  it('loads posts, metrics, accounts and decisions on success', async () => {
    serviceRole.client = okClient();
    const res = await loadSocialPerformance({
      config: readControlCenterConfig({
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'k',
      }),
      now: new Date('2026-08-22T00:00:00Z'),
    });
    expect(res.status).toBe('ok');
    expect(res.accounts).toHaveLength(1);
    expect(res.episodes).toHaveLength(1);
    expect(res.episodes[0]?.platforms[0]).toMatchObject({ views: 10 });
  });

  it('tolerates a strategy read failure and still returns decisions', async () => {
    const base = okClient();
    serviceRole.client = {
      from: (table: string) => {
        if (table === 'social_strategy_versions') {
          const chain: Record<string, unknown> = {};
          for (const m of ['select', 'eq']) chain[m] = () => chain;
          chain['then'] = (ok: (v: unknown) => unknown) =>
            Promise.resolve({ data: null, error: { message: 'strategy boom' } }).then(ok);
          return chain;
        }
        return (base as { from: (t: string) => unknown }).from(table);
      },
    };
    const res = await loadSocialPerformance({
      config: readControlCenterConfig({
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'k',
      }),
    });
    expect(res.status).toBe('ok');
  });

  it('maps a telemetry error to the error response', async () => {
    serviceRole.client = {
      from: () => {
        const chain: Record<string, unknown> = {};
        for (const m of ['select', 'gte', 'order', 'limit', 'eq', 'not'])
          chain[m] = () => chain;
        chain['then'] = (ok: (v: unknown) => unknown) =>
          Promise.resolve({ data: null, error: { message: 'telemetry down' } }).then(ok);
        return chain;
      },
    };
    const res = await loadSocialPerformance({
      config: readControlCenterConfig({
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'k',
      }),
    });
    expect(res.status).toBe('error');
    expect(res.message).toBe('Social telemetry request failed');
  });

  it('prefers zh-Hant titles, keeps the newest publish date, and sorts episodes desc', () => {
    const posts = [
      post('a', { episode_id: 'ep', language_code: 'en', published_at: '2026-08-20T00:00:00Z', published_title: 'EN' }),
      post('b', { episode_id: 'ep', language_code: 'zh-Hant', published_at: '2026-08-19T00:00:00Z', published_title: '繁中' }),
      post('c', { episode_id: 'ep2', published_at: '2026-08-21T00:00:00Z' }),
    ];
    const metrics = [
      metric('a', 5, { impressions: 50 }),
      metric('b', 7, { impressions: 70 }),
      metric('c', null),
    ];
    const episodes = buildEpisodes(posts as never, metrics as never, 'latest');
    expect(episodes.find((e) => e.episodeId === 'ep')?.title).toBe('繁中');
    expect(episodes[0]?.episodeId).toBe('ep2');
    expect(episodes.find((e) => e.episodeId === 'ep')?.totalImpressions).toBe(120);
  });

  it('falls back to body first line and Untitled episode for titles', () => {
    const posts = [
      post('t1', { published_title: '  ', published_body: 'First line\nrest' }),
      post('t2', { published_title: '  ', published_body: '' }),
    ];
    const episodes = buildEpisodes(posts as never, [] as never, 'latest');
    expect(episodes.find((e) => e.episodeId === 'episode-t1')?.title).toBe('First line');
    expect(episodes.find((e) => e.episodeId === 'episode-t2')?.title).toBe('Untitled episode');
  });

  it('emits strategy-only decisions with low confidence and formatted slots', () => {
    const decisions = buildDecisions(
      [],
      [],
      [{ platform: 'youtube', config: { publishSlotsJst: [{ hour: 9, minute: 5 }, { hour: 8, minute: 30 }] } }] as never,
    );
    const yt = decisions.find((d) => d.platform === 'youtube');
    expect(yt).toMatchObject({
      evidenceSamples: 0,
      confidence: 'low',
      publishSlotsJst: '08:30 / 09:05',
      bestTopic: null,
    });
  });

  it('grades confidence and picks the best qualified topic', () => {
    const posts: unknown[] = [];
    const metrics: unknown[] = [];
    const add = (topic: string, views: number[]) => {
      views.forEach((v, i) => {
        const id = `x-${topic}-${i}-${v}`;
        posts.push(post(id, { platform: 'x', topic }));
        metrics.push(metric(id, v));
      });
    };
    add('alpha', [100, 110, 120]);
    add('beta', [10, 12, 11]);
    const [decision] = buildDecisions(posts as never, metrics as never, [] as never);
    expect(decision?.evidenceSamples).toBe(6);
    expect(decision?.bestTopic).toBe('alpha');
    expect(decision?.bestTopicLiftVsPlatformMedian).toBeGreaterThan(1);
    expect(decision?.topExample).toContain('120');
  });

  it('returns null topics with fewer than two qualified buckets', () => {
    const posts = [post('s1', { platform: 'x', topic: 'solo' })];
    const decisions = buildDecisions(posts as never, [metric('s1', 10)] as never, [] as never);
    expect(decisions.find((d) => d.platform === 'x')?.bestTopic).toBeNull();
  });

  it('reports null engagement when impressions and views are missing', () => {
    const episodes = buildEpisodes(
      [post('e1')] as never,
      [metric('e1', null, { likes: 1 })] as never,
      'latest',
    );
    expect(episodes[0]?.platforms[0]).toMatchObject({
      views: null,
      engagementRate: null,
    });
  });
});
