import type { SocialGrowthJourney } from '../../../shared/growth-journey.js';
import type { ControlCenterConfig } from '../../config/env.js';
import { createAsyncCache } from '../cache.js';
import { loadGrowthJourney } from '../growth-journey.js';

export interface OperationsGrowthResponse {
  observedAt: string;
  status: 'available' | 'unknown';
  windowDays: 30;
  journey: SocialGrowthJourney;
}

/** Data availability is not a judgement of product effectiveness. */
export function createOperationsGrowth(input: {
  config: ControlCenterConfig;
  now?: () => Date;
  fetchImpl?: typeof fetch;
}) {
  const cache = createAsyncCache<OperationsGrowthResponse>({
    ttlMs: 15 * 60_000,
    load: async () => {
      const observedAt = (input.now?.() ?? new Date()).toISOString();
      const journey = await loadGrowthJourney(input);
      return {
        observedAt,
        status: journey.status === 'ok' ? 'available' : 'unknown',
        windowDays: 30,
        journey,
      };
    },
  });
  return (force = false) => cache.get(force);
}
