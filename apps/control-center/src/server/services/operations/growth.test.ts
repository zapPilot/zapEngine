import { describe, expect, it, vi } from 'vitest';
import { unavailableDiscordCommunity } from '../../../shared/growth.js';
import { unavailableWaitlist } from '../../../shared/waitlist-growth.js';
import { readControlCenterConfig } from '../../config/env.js';
import { createOperationsGrowth } from './growth.js';
import { posthogQueryFetch } from './posthog-testing.js';

const config = readControlCenterConfig({
  POSTHOG_PERSONAL_API_KEY: 'test-key',
  POSTHOG_PROJECT_ID: '123',
});
function dependencies() {
  return {
    socialGrowth: {
      getSocialGrowth: vi
        .fn()
        .mockResolvedValue({ waitlist: unavailableWaitlist('offline') }),
    },
    community: vi
      .fn()
      .mockResolvedValue(
        unavailableDiscordCommunity('offline', '2026-09-19T00:00:00Z'),
      ),
  };
}

describe('lazy growth operations', () => {
  it('performs no unconfigured requests and preserves unknown counts', async () => {
    const fetchImpl = posthogQueryFetch();
    const get = createOperationsGrowth({
      config: readControlCenterConfig({}),
      fetchImpl,
      ...dependencies(),
    });
    expect(await get()).toMatchObject({
      status: 'unknown',
      journey: { ctaUsers30d: null },
      laneSources: {
        posthog: { status: 'unavailable' },
        socialPosts: { status: 'unavailable' },
      },
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('loads on demand, caches, and propagates forced refresh to both downstream caches', async () => {
    const deps = dependencies();
    const fetchImpl = posthogQueryFetch();
    const get = createOperationsGrowth({ config, fetchImpl, ...deps });
    expect(fetchImpl).not.toHaveBeenCalled();
    const first = await get();
    expect(first).toMatchObject({
      status: 'available',
      windowDays: 30,
      journey: { landingVisitors30d: 300, ctaUsers30d: 12 },
      community: { status: 'unavailable' },
    });
    expect(first.lanes[0]?.waitlistSignups).toBeNull();
    expect(await get()).toBe(first);
    expect(fetchImpl).toHaveBeenCalledTimes(5);
    await get(true);
    expect(fetchImpl).toHaveBeenCalledTimes(10);
    expect(deps.socialGrowth.getSocialGrowth).toHaveBeenLastCalledWith(true);
    expect(deps.community).toHaveBeenLastCalledWith(true);
  });
  it('retains waitlist lanes when PostHog fails', async () => {
    const deps = dependencies();
    deps.socialGrowth.getSocialGrowth.mockResolvedValue({
      waitlist: {
        status: 'ok',
        message: null,
        conversions: [
          {
            episodeId: 'episode',
            platform: 'x',
            languageCode: 'en',
            signups: 3,
          },
        ],
      },
    });
    const get = createOperationsGrowth({
      config,
      ...deps,
      fetchImpl: vi.fn<typeof fetch>().mockRejectedValue(new Error('offline')),
    });
    expect(await get()).toMatchObject({
      status: 'unknown',
      journey: { landingVisitors30d: null },
      lanes: [
        { episodeId: 'episode', landingVisitors30d: null, waitlistSignups: 3 },
      ],
    });
  });
});
