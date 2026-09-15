import { describe, expect, it, vi, beforeEach } from 'vitest';

import { readControlCenterConfig } from '../config/env.js';
import {
  createGrowthJourneyService,
  loadGrowthJourney,
} from './growth-journey.js';

vi.mock('./operations/posthog.js', () => ({
  readPosthogGrowthJourney: vi.fn(),
}));

import { readPosthogGrowthJourney } from './operations/posthog.js';

const mockedRead = vi.mocked(readPosthogGrowthJourney);

beforeEach(() => mockedRead.mockReset());

describe('growth journey coverage', () => {
  it('caches the journey and supports forced refresh', async () => {
    mockedRead.mockResolvedValue({
      landingVisitors30d: 10,
      ctaUsers30d: 1,
      appVisitors30d: 2,
      walletConnectedUsers30d: 1,
      landingThreads30d: 3,
      landingX30d: 1,
      landingYoutube30d: 1,
      landingRednote30d: 1,
      landingDirect30d: 2,
      landingOther30d: 2,
    });
    const service = createGrowthJourneyService({
      config: readControlCenterConfig({
        POSTHOG_PERSONAL_API_KEY: 'k',
        POSTHOG_PROJECT_ID: '1',
      }),
    });
    const first = await service.getJourney();
    const second = await service.getJourney();
    expect(first.status).toBe('ok');
    expect(mockedRead).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
    await service.getJourney(true);
    expect(mockedRead).toHaveBeenCalledTimes(2);
  });

  it('maps a non-Error rejection to the generic unavailable message', async () => {
    mockedRead.mockRejectedValueOnce('string-boom');
    const journey = await loadGrowthJourney({
      config: readControlCenterConfig({
        POSTHOG_PERSONAL_API_KEY: 'k',
        POSTHOG_PROJECT_ID: '1',
      }),
    });
    expect(journey.status).toBe('unavailable');
    expect(journey.message).toBe(
      'PostHog acquisition telemetry is unavailable',
    );
    expect(journey.landingVisitors30d).toBeNull();
  });
});
