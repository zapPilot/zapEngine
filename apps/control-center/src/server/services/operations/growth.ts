import type { createClient } from '@supabase/supabase-js';
import {
  unavailableGrowthLaneSources,
  type DiscordCommunitySummary,
  type OperationsGrowthResponse,
} from '../../../shared/growth.js';
import type { ControlCenterConfig } from '../../config/env.js';
import { createAsyncCache } from '../cache.js';
import { loadGrowthJourney } from '../growth-journey.js';
import type { createSocialGrowthService } from '../social-growth.js';
import { postgrestErrorMessage } from '../supabase.js';
import { composeGrowthLanes, readRecentSocialPosts } from './growth-lanes.js';
import { readPosthogGrowthLanes } from './posthog.js';

/** Data availability is not a judgement of product effectiveness. */
export function createOperationsGrowth(input: {
  config: ControlCenterConfig;
  now?: () => Date;
  fetchImpl?: typeof fetch;
  socialGrowth: Pick<
    ReturnType<typeof createSocialGrowthService>,
    'getSocialGrowth'
  >;
  community: (force: boolean) => Promise<DiscordCommunitySummary>;
  createSupabaseClient?: typeof createClient;
}) {
  const cache = createAsyncCache<OperationsGrowthResponse>({
    ttlMs: 15 * 60_000,
    load: async (force) => {
      const now = input.now?.() ?? new Date();
      const [journey, posthog, posts, social, community] = await Promise.all([
        loadGrowthJourney(input),
        settle(readPosthogGrowthLanes(input)),
        settle(readRecentSocialPosts({ ...input, now })),
        input.socialGrowth.getSocialGrowth(force),
        input.community(force),
      ]);
      const laneSources = unavailableGrowthLaneSources('Source unavailable');
      laneSources.posthog = posthog.source;
      laneSources.socialPosts = posts.source;
      laneSources.waitlist = {
        status: social.waitlist.status,
        message: social.waitlist.message,
      };
      return {
        observedAt: now.toISOString(),
        status: journey.status === 'ok' ? 'available' : 'unknown',
        windowDays: 30,
        journey,
        community,
        laneSources,
        lanes: composeGrowthLanes({
          posthog: posthog.data,
          posts: posts.data,
          waitlist: social.waitlist,
        }),
      };
    },
  });
  return (force = false) => cache.get(force);
}

async function settle<T>(promise: Promise<T>) {
  try {
    return {
      data: await promise,
      source: { status: 'ok' as const, message: null },
    };
  } catch (error) {
    return {
      data: null,
      source: {
        status: 'unavailable' as const,
        message: postgrestErrorMessage(error, 'Growth source unavailable'),
      },
    };
  }
}
