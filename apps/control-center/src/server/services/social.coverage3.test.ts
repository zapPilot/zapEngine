import { describe, expect, it, vi } from 'vitest';

import { readControlCenterConfig } from '../config/env.js';
import { buildEpisodes, loadSocialPerformance } from './social.js';

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

function metric(
  id: string,
  views: number | null,
  overrides: Record<string, unknown> = {},
) {
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

function nullDataClient() {
  return {
    from: () => {
      const chain: Record<string, unknown> = {};
      for (const m of ['select', 'gte', 'order', 'limit', 'eq', 'not']) {
        chain[m] = () => chain;
      }
      chain['then'] = (ok: (v: unknown) => unknown) =>
        Promise.resolve({ data: null, error: null }).then(ok);
      return chain;
    },
  };
}

describe('social coverage round 3', () => {
  it('tolerates null data payloads across every telemetry query', async () => {
    serviceRole.client = nullDataClient();
    const res = await loadSocialPerformance({
      config: readControlCenterConfig({
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'k',
      }),
      now: new Date('2026-08-22T00:00:00Z'),
    });
    expect(res.status).toBe('ok');
    expect(res.accounts).toEqual([]);
    expect(res.episodes).toEqual([]);
  });

  it('sums a null-view episode without inventing engagement', () => {
    const episodes = buildEpisodes(
      [post('e-null')] as never,
      [metric('e-null', null, { impressions: null })] as never,
      'latest',
      new Date('2026-08-30T12:00:00.000Z'),
    );
    expect(episodes[0]?.platforms[0]).toMatchObject({ views: null });
  });
});
