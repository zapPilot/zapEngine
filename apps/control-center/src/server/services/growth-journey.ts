import {
  unavailableGrowthJourney,
  type SocialGrowthJourney,
} from '../../shared/growth-journey.js';
import type { ControlCenterConfig } from '../config/env.js';
import { readPosthogGrowthJourney } from './operations/posthog.js';

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
    return unavailableGrowthJourney(
      error instanceof Error
        ? error.message
        : 'PostHog acquisition telemetry is unavailable',
    );
  }
}
