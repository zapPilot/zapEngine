import { describe, expect, it, vi } from 'vitest';

import { readControlCenterConfig } from '../config/env.js';
import { loadGrowthJourney } from './growth-journey.js';

const NOW = new Date('2026-09-09T06:00:00.000Z');
const CONFIG = readControlCenterConfig({
  POSTHOG_PERSONAL_API_KEY: 'phx-key',
  POSTHOG_PROJECT_ID: '4242',
});
const AUDIENCE_ROW = [318, 1204, 90, 300, 4, 12, 20, 55, 8, 21, 6];
const SOURCE_ROWS = [
  ['threads', 210],
  ['x', 40],
  ['youtube', 15],
  ['rednote', 5],
  ['direct', 20],
  ['other', 10],
];

function fetchPosthog() {
  return vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ results: [AUDIENCE_ROW] }), { status: 200 }),
    )
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ results: SOURCE_ROWS }), { status: 200 }),
    );
}

describe('loadGrowthJourney', () => {
  it('returns only the acquisition fields Growth needs', async () => {
    const fetchImpl = fetchPosthog();

    const journey = await loadGrowthJourney({
      config: CONFIG,
      now: NOW,
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(journey).toEqual({
      status: 'ok',
      message: null,
      landingVisitors30d: 300,
      ctaUsers30d: 12,
      appVisitors30d: 55,
      walletConnectedUsers30d: 21,
      landingThreads30d: 210,
      landingX30d: 40,
      landingYoutube30d: 15,
      landingRednote30d: 5,
      landingDirect30d: 20,
      landingOther30d: 10,
    });
  });

  it('stays unavailable when PostHog credentials are absent', async () => {
    const journey = await loadGrowthJourney({
      config: readControlCenterConfig({}),
      now: NOW,
    });

    expect(journey.status).toBe('unavailable');
    expect(journey.message).toContain('POSTHOG_PERSONAL_API_KEY');
  });

  it('does not fabricate partial journey counts when PostHog degrades', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ results: [AUDIENCE_ROW] }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response('boom', { status: 503 }));

    const journey = await loadGrowthJourney({
      config: CONFIG,
      now: NOW,
      fetchImpl,
    });

    expect(journey).toMatchObject({
      status: 'unavailable',
      landingVisitors30d: null,
      ctaUsers30d: null,
    });
  });
});
