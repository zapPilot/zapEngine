import { describe, expect, it, vi, beforeEach } from 'vitest';

import { readControlCenterConfig } from '../config/env.js';
import { loadGrowthJourney } from './growth-journey.js';

vi.mock('./operations/posthog.js', () => ({
  readPosthogGrowthJourney: vi.fn(),
}));

import { readPosthogGrowthJourney } from './operations/posthog.js';

const mockedRead = vi.mocked(readPosthogGrowthJourney);

beforeEach(() => mockedRead.mockReset());

describe('growth journey coverage', () => {
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
