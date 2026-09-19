// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { SocialGrowthJourney } from '../../shared/growth-journey.js';
import type { SocialGrowthResponse } from '../../shared/types.js';
import { GrowthJourneyPanel } from './GrowthJourneyPanel.js';

afterEach(cleanup);

const GROWTH = {
  status: 'ok',
  message: null,
  generatedAt: '2026-09-09T06:00:00.000Z',
  platforms: [],
  experiments: [],
  attribution: [],
  waitlist: {
    status: 'ok',
    message: null,
    total: 8,
    signups7d: 3,
    signups30d: 8,
    attributedSocial7d: 2,
    directOrUnknown7d: 1,
    conversions: [],
  },
} as unknown as SocialGrowthResponse;

function okJourney(
  overrides: Partial<SocialGrowthJourney> = {},
): SocialGrowthJourney {
  return {
    status: 'ok',
    message: null,
    landingVisitors30d: 300,
    ctaUsers30d: 12,
    discordCtaUsers30d: 0,
    discordCtaPostWaitlistUsers30d: 0,
    appVisitors30d: 55,
    walletConnectedUsers30d: 21,
    landingThreads30d: 210,
    landingX30d: 40,
    landingYoutube30d: 15,
    landingRednote30d: 5,
    landingDirect30d: 20,
    landingOther30d: 10,
    ...overrides,
  } as SocialGrowthJourney;
}

describe('GrowthJourneyPanel coverage', () => {
  it('waits for telemetry when no journey has arrived yet', () => {
    render(
      <GrowthJourneyPanel community={null} growth={GROWTH} journey={null} />,
    );

    expect(screen.getByText('Journey telemetry unavailable')).toBeVisible();
    expect(screen.getByText('Waiting for PostHog data.')).toBeVisible();
  });

  it('renders null source counts as dashes with a minimal bar', () => {
    render(
      <GrowthJourneyPanel
        community={null}
        growth={GROWTH}
        journey={okJourney({
          landingThreads30d: null,
          landingX30d: null,
          landingYoutube30d: null,
          landingRednote30d: null,
          landingDirect30d: null,
          landingOther30d: null,
        })}
      />,
    );

    // All six acquisition sources fall back to 0 width, clamped to 4%.
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    expect(screen.getAllByText('300')).toHaveLength(2);
  });

  it('says not enough data when the CTA rate cannot be computed', () => {
    render(
      <GrowthJourneyPanel
        community={null}
        growth={GROWTH}
        journey={okJourney({ ctaUsers30d: null, landingVisitors30d: null })}
      />,
    );

    expect(screen.getByText('Not enough data')).toBeVisible();
    expect(screen.getByText('PostHog')).toBeVisible();
  });

  it('says not enough data when landing is zero', () => {
    render(
      <GrowthJourneyPanel
        community={null}
        growth={GROWTH}
        journey={okJourney({ ctaUsers30d: 0, landingVisitors30d: 0 })}
      />,
    );

    expect(screen.getByText('Not enough data')).toBeVisible();
  });
});
