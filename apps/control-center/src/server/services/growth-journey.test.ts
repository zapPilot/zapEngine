import { posthogQueryFetch } from './operations/posthog-testing.js';
import { describe, expect, it } from 'vitest';

import { readControlCenterConfig } from '../config/env.js';
import { loadGrowthJourney } from './growth-journey.js';

const CONFIG = readControlCenterConfig({
  POSTHOG_PERSONAL_API_KEY: 'phx-key',
  POSTHOG_PROJECT_ID: '4242',
});
describe('loadGrowthJourney', () => {
  it('uses an ordered PostHog funnel for Landing to CTA', async () => {
    const fetchImpl = posthogQueryFetch();

    const journey = await loadGrowthJourney({ config: CONFIG, fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(4);
    const bodies = fetchImpl.mock.calls.map((call) =>
      JSON.parse(String(call[1]?.body)),
    );
    const sourceQuery = bodies.find(
      (body) =>
        body.query?.kind === 'HogQLQuery' &&
        body.query.query?.includes('argMin('),
    );
    const funnelQuery = bodies.find(
      (body) => body.query?.kind === 'FunnelsQuery',
    );
    expect(sourceQuery?.query.query).toContain(
      "extractURLParameter(properties.$current_url, 'utm_source')",
    );
    expect(funnelQuery).toMatchObject({
      query: {
        kind: 'FunnelsQuery',
        dateRange: { date_from: '-30d' },
        funnelsFilter: {
          funnelOrderType: 'ordered',
          funnelWindowInterval: 1,
          funnelWindowIntervalUnit: 'day',
        },
        series: [{ event: '$pageview' }, { event: 'waitlist_cta_clicked' }],
      },
    });
    expect(journey).toEqual({
      status: 'ok',
      message: null,
      landingVisitors30d: 300,
      ctaUsers30d: 12,
      discordCtaUsers30d: 7,
      discordCtaPostWaitlistUsers30d: 2,
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

  it('does not borrow the CTA count when Discord steps are missing', async () => {
    const journey = await loadGrowthJourney({
      config: CONFIG,
      fetchImpl: posthogQueryFetch({ discord: [{ order: 0, count: 300 }] }),
    });
    expect(journey.status).toBe('unavailable');
    expect(journey.discordCtaUsers30d).toBeNull();
    expect(journey.message).toContain('Discord');
  });

  it('stays unavailable when PostHog credentials are absent', async () => {
    const journey = await loadGrowthJourney({
      config: readControlCenterConfig({}),
    });

    expect(journey.status).toBe('unavailable');
    expect(journey.message).toContain('POSTHOG_PERSONAL_API_KEY');
  });

  it('does not fabricate partial journey counts when any provider query fails', async () => {
    const fetchImpl = posthogQueryFetch({ status: 503 });

    const journey = await loadGrowthJourney({ config: CONFIG, fetchImpl });

    expect(journey).toMatchObject({
      status: 'unavailable',
      landingVisitors30d: null,
      ctaUsers30d: null,
      discordCtaUsers30d: null,
      discordCtaPostWaitlistUsers30d: null,
    });
  });

  it('does not substitute independent audience aggregates for missing funnel steps', async () => {
    const fetchImpl = posthogQueryFetch({ cta: [{ order: 0, count: 300 }] });

    const journey = await loadGrowthJourney({ config: CONFIG, fetchImpl });

    expect(journey.status).toBe('unavailable');
    expect(journey.ctaUsers30d).toBeNull();
  });
});
