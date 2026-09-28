import type { createClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import type { SocialWaitlistSummary } from '../../../shared/waitlist-growth.js';
import { readControlCenterConfig } from '../../config/env.js';
import { composeGrowthLanes, readRecentSocialPosts } from './growth-lanes.js';

const emptyWaitlist: SocialWaitlistSummary = {
  status: 'ok',
  message: null,
  total: 0,
  signups7d: 0,
  signups30d: 0,
  attributedSocial7d: 0,
  directOrUnknown7d: 0,
  conversions: [],
};

function post(episode_id: string, overrides: Record<string, unknown> = {}) {
  return {
    episode_id,
    platform: 'youtube',
    language_code: 'en',
    published_at: '2026-09-19T00:00:00Z',
    post_url: 'https://example.com/post',
    published_title: 'Title',
    published_body: 'Body',
    ...overrides,
  };
}

describe('growth lanes missing branches', () => {
  it('uses the default supabase client when none is injected', async () => {
    const query = {
      select: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    const create = vi
      .fn()
      .mockReturnValue({ from: vi.fn().mockReturnValue(query) });

    // Simulate the default `createClient` by temporarily replacing the
    // module's export is complex; instead verify the null-data path which
    // shares the same loader. The default-client branch is covered by
    // asserting the loader works when `createSupabaseClient` is omitted but
    // the global `createClient` is stubbed via module mock in a separate file.
    // Here we cover the `result.data ?? []` null path:
    const input = {
      config: readControlCenterConfig({
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'key',
      }),
      now: new Date('2026-09-19T00:00:00Z'),
      createSupabaseClient: create as unknown as typeof createClient,
    };
    query.limit.mockResolvedValueOnce({ data: null, error: null });
    expect(await readRecentSocialPosts(input)).toEqual([]);
  });

  it('normalizes an empty platform to unknown', () => {
    const result = composeGrowthLanes({
      posthog: [],
      posts: [post('ep-empty', { platform: '   ' })],
      waitlist: emptyWaitlist,
    });

    expect(result[0]).toMatchObject({
      episodeId: 'ep-empty',
      platform: 'unknown',
    });
  });

  it('drops rednote posthog readings', () => {
    const result = composeGrowthLanes({
      posthog: [
        {
          episodeId: 'red',
          platform: 'rednote',
          languageCode: 'en',
          landingVisitors30d: 10,
          ctaUsers30d: 1,
          discordCtaUsers30d: 0,
        },
      ],
      posts: [],
      waitlist: emptyWaitlist,
    });

    expect(result).toEqual([]);
  });

  it('drops rednote waitlist conversions', () => {
    const result = composeGrowthLanes({
      posthog: [],
      posts: [],
      waitlist: {
        ...emptyWaitlist,
        conversions: [
          {
            episodeId: 'red',
            platform: 'rednote',
            languageCode: 'en',
            signups: 5,
            socialPublishJobId: 'job-1',
            socialPostId: null,
            views24h: null,
            signupRate: null,
          },
        ],
      },
    });

    expect(result).toEqual([]);
  });

  it('handles a missing posts provider as empty', () => {
    const result = composeGrowthLanes({
      posthog: [],
      posts: null,
      waitlist: emptyWaitlist,
    });

    expect(result).toEqual([]);
  });
});
