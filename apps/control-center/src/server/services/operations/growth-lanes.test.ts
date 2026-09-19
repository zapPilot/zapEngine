import type { createClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import {
  unavailableWaitlist,
  type SocialWaitlistSummary,
} from '../../../shared/waitlist-growth.js';
import { GROWTH_LANE_CAP } from '../../../shared/growth.js';
import { readControlCenterConfig } from '../../config/env.js';
import { composeGrowthLanes, readRecentSocialPosts } from './growth-lanes.js';
import { readPosthogGrowthLanes } from './posthog.js';
import { posthogQueryFetch } from './posthog-testing.js';

const config = readControlCenterConfig({
  POSTHOG_PERSONAL_API_KEY: 'key',
  POSTHOG_PROJECT_ID: '123',
});
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
function post(episode_id: string, published_at = '2026-09-19T00:00:00Z') {
  return {
    episode_id,
    platform: 'youtube',
    language_code: 'en',
    published_at,
    post_url: 'https://example.com/post',
    published_title: 'Latest title',
    published_body: 'Body',
  };
}
function conversion(signups: number, socialPublishJobId: string) {
  return {
    episodeId: 'episode',
    platform: 'youtube',
    languageCode: 'en',
    signups,
    socialPublishJobId,
    socialPostId: null,
    views24h: null,
    signupRate: null,
  };
}

describe('growth lanes', () => {
  it('joins the union, sums jobs, takes latest title, and distinguishes unavailable from measured zero', () => {
    const result = composeGrowthLanes({
      posthog: null,
      posts: [
        post('episode'),
        { ...post('episode', '2026-09-18T00:00:00Z'), published_title: 'Old' },
        post('other'),
      ],
      waitlist: {
        ...emptyWaitlist,
        conversions: [conversion(2, 'job1'), conversion(3, 'job2')],
      },
    });
    expect(result.find((row) => row.episodeId === 'episode')).toMatchObject({
      title: 'Latest title',
      waitlistSignups: 5,
      landingVisitors30d: null,
      discordCtaUsers30d: null,
    });
    expect(
      result.find((row) => row.episodeId === 'other')?.waitlistSignups,
    ).toBe(0);
    expect(
      composeGrowthLanes({
        posthog: [],
        posts: [post('empty')],
        waitlist: unavailableWaitlist('offline'),
      })[0],
    ).toMatchObject({
      landingVisitors30d: 0,
      ctaUsers30d: 0,
      discordCtaUsers30d: 0,
      waitlistSignups: null,
    });
  });
  it('keeps PostHog-only rows, normalizes missing languages and excludes rednote', () => {
    const result = composeGrowthLanes({
      posthog: [
        {
          episodeId: 'telemetry',
          platform: ' X ',
          languageCode: '',
          landingVisitors30d: 3,
          ctaUsers30d: 1,
          discordCtaUsers30d: 2,
        },
      ],
      posts: [
        { ...post('null-lang'), language_code: null },
        { ...post('no-link'), platform: 'rednote' },
      ],
      waitlist: emptyWaitlist,
    });
    expect(result).toHaveLength(2);
    expect(result[1]).toMatchObject({
      episodeId: 'telemetry',
      platform: 'x',
      languageCode: 'unknown',
      landingVisitors30d: 3,
      discordCtaUsers30d: 2,
      publishedAt: null,
    });
    expect(result[0]?.languageCode).toBe('unknown');
  });
  it('caps rows after sorting newest first', () => {
    const result = composeGrowthLanes({
      posthog: [],
      posts: Array.from({ length: 80 }, (_, n) =>
        post(String(n), new Date(1_000_000 * n).toISOString()),
      ),
      waitlist: emptyWaitlist,
    });
    expect(result).toHaveLength(GROWTH_LANE_CAP);
    expect(result[0]?.episodeId).toBe('79');
  });
  it('validates PostHog rows and normalizes platform/language', async () => {
    expect(
      await readPosthogGrowthLanes({
        config,
        fetchImpl: posthogQueryFetch({
          lanes: [['e', ' YouTube ', null, '3', 1, 0]],
        }),
      }),
    ).toEqual([
      {
        episodeId: 'e',
        platform: 'youtube',
        languageCode: 'unknown',
        landingVisitors30d: 3,
        ctaUsers30d: 1,
        discordCtaUsers30d: 0,
      },
    ]);
    await expect(
      readPosthogGrowthLanes({
        config,
        fetchImpl: posthogQueryFetch({ lanes: [['broken']] }),
      }),
    ).rejects.toThrow('unusable');
    await expect(
      readPosthogGrowthLanes({ config: readControlCenterConfig({}) }),
    ).rejects.toThrow('not configured');
  });
  it('reads only bounded acquisition metadata in the configured schema and propagates PostgREST errors', async () => {
    const query = {
      select: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [post('e')], error: null }),
    };
    const create = vi
      .fn()
      .mockReturnValue({ from: vi.fn().mockReturnValue(query) });
    const input = {
      config: readControlCenterConfig({
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'key',
      }),
      now: new Date('2026-09-19T00:00:00Z'),
      createSupabaseClient: create as unknown as typeof createClient,
    };
    expect(await readRecentSocialPosts(input)).toHaveLength(1);
    expect(create).toHaveBeenCalledWith(
      expect.any(String),
      'key',
      expect.objectContaining({
        db: { schema: input.config.SUPABASE_DB_SCHEMA },
      }),
    );
    expect(query.gte).toHaveBeenCalledWith(
      'published_at',
      '2026-08-20T00:00:00.000Z',
    );
    expect(query.limit).toHaveBeenCalledWith(500);
    query.limit.mockResolvedValue({
      data: null,
      error: { message: 'permission denied' },
    });
    await expect(readRecentSocialPosts(input)).rejects.toEqual({
      message: 'permission denied',
    });
    await expect(
      readRecentSocialPosts({ ...input, config: readControlCenterConfig({}) }),
    ).rejects.toThrow('Supabase');
  });
});
