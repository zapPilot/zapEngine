// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { SocialGrowthJourney } from '../../shared/growth-journey.js';
import type { SocialGrowthResponse } from '../../shared/types.js';
import { GrowthJourneyPanel } from './GrowthJourneyPanel.js';

afterEach(cleanup);

const JOURNEY = {
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
} satisfies SocialGrowthJourney;

const UNAVAILABLE_JOURNEY = {
  status: 'unavailable',
  message: 'PostHog timed out',
  landingVisitors30d: null,
  ctaUsers30d: null,
  discordCtaUsers30d: null,
  discordCtaPostWaitlistUsers30d: null,
  appVisitors30d: null,
  walletConnectedUsers30d: null,
  landingThreads30d: null,
  landingX30d: null,
  landingYoutube30d: null,
  landingRednote30d: null,
  landingDirect30d: null,
  landingOther30d: null,
} satisfies SocialGrowthJourney;

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
} satisfies SocialGrowthResponse;

describe('GrowthJourneyPanel', () => {
  it('keeps person flow and durable waitlist counts visibly separate', () => {
    render(
      <GrowthJourneyPanel community={null} growth={GROWTH} journey={JOURNEY} />,
    );

    expect(screen.getAllByText('300')).toHaveLength(2);
    expect(screen.getByText('210')).toBeVisible();
    expect(screen.getByText('12')).toBeVisible();
    expect(screen.getByText('8')).toBeVisible();
    expect(screen.getByText('55')).toBeVisible();
    expect(screen.getByText('21')).toBeVisible();
    expect(screen.getByText('Supabase durable rows')).toBeVisible();
    expect(screen.getByText('PostHog · not identity-linked')).toBeVisible();
    expect(screen.getByText(/aggregate counts/i)).toBeVisible();
    expect(screen.getByText(/96% leave before waitlist CTA/i)).toBeVisible();
  });

  it('renders the parent snapshot failure without making another request', () => {
    render(
      <GrowthJourneyPanel
        community={null}
        growth={GROWTH}
        journey={UNAVAILABLE_JOURNEY}
      />,
    );

    expect(screen.getByText('Journey telemetry unavailable')).toBeVisible();
    expect(screen.getByText('PostHog timed out')).toBeVisible();
  });
});
