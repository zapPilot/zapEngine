import type { SocialGrowthJourney } from '../../shared/growth-journey.js';
import type { ControlCenterConfig } from '../config/env.js';
import { createAsyncCache } from './cache.js';
import { readPosthogGrowthJourney } from './operations/posthog.js';

const TTL_MS = 15 * 60_000;

export function createGrowthJourneyService(input: {
  config: ControlCenterConfig;
}) {
  const cache = createAsyncCache({
    ttlMs: TTL_MS,
    load: () => loadGrowthJourney({ config: input.config }),
  });
  return { getJourney: (force = false) => cache.get(force) };
}

export async function loadGrowthJourney(input: {
  config: ControlCenterConfig;
  fetchImpl?: typeof fetch;
}): Promise<SocialGrowthJourney> {
  try {
    const reading = await readPosthogGrowthJourney({
      config: input.config,
      ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
    });
    return {
      status: 'ok',
      message: null,
      ...reading,
    };
  } catch (error) {
    return unavailable(
      error instanceof Error
        ? error.message
        : 'PostHog acquisition telemetry is unavailable',
    );
  }
}

function unavailable(message: string): SocialGrowthJourney {
  return {
    status: 'unavailable',
    message,
    landingVisitors30d: null,
    ctaUsers30d: null,
    appVisitors30d: null,
    walletConnectedUsers30d: null,
    landingThreads30d: null,
    landingX30d: null,
    landingYoutube30d: null,
    landingRednote30d: null,
    landingDirect30d: null,
    landingOther30d: null,
  };
}
