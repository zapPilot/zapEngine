// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  SocialGrowthResponse,
  SocialPerformanceResponse,
} from '../../shared/types.js';
import type { SocialGrowthJourney } from '../../shared/growth-journey.js';
import { GrowthPage } from './GrowthPage.js';

afterEach(cleanup);

const journey: SocialGrowthJourney = {
  appVisitors30d: 6,
  ctaUsers30d: 1,
  discordCtaUsers30d: 0,
  discordCtaPostWaitlistUsers30d: 0,
  landingDirect30d: 4,
  landingOther30d: 2,
  landingRednote30d: 0,
  landingThreads30d: 161,
  landingVisitors30d: 179,
  landingX30d: 4,
  landingYoutube30d: 8,
  message: null,
  status: 'ok',
  walletConnectedUsers30d: 1,
};

const emptyWaitlist = {
  attributedSocial7d: 0,
  conversions: [],
  directOrUnknown7d: 0,
  message: null,
  signups30d: 0,
  signups7d: 0,
  status: 'ok',
  total: 0,
} as const;

const growth = {
  attribution: [],
  experiments: [],
  generatedAt: '2026-09-10T01:00:00Z',
  message: null,
  platforms: [],
  status: 'ok',
  waitlist: emptyWaitlist,
} as unknown as SocialGrowthResponse;

function baseSocial(
  overrides: Partial<SocialPerformanceResponse> = {},
): SocialPerformanceResponse {
  return {
    accounts: [],
    decisions: [],
    episodes: [],
    generatedAt: '2026-09-10T01:00:00Z',
    message: null,
    status: 'ok',
    window: 'latest',
    ...overrides,
  } as unknown as SocialPerformanceResponse;
}

describe('GrowthPage confidence fallback', () => {
  it('falls back to neutral tone for an unknown confidence', () => {
    const onWindowChange = vi.fn(async () => undefined);
    const data = baseSocial({
      decisions: [
        {
          avoidHashtags: [],
          bestTopic: 'AI',
          bestTopicLiftVsPlatformMedian: null,
          bestTopicMedian24hViews: null,
          bestTopicSamples: 0,
          confidence: 'mystery',
          evidenceSamples: 4,
          platform: 'x',
          platformMedian24hViews: null,
          preferredHashtags: [],
          preferredHookTypes: [],
          publishSlotsJst: null,
          topExample: null,
        },
      ],
    } as unknown as Partial<SocialPerformanceResponse>);
    render(
      <GrowthPage
        acquisition={null}
        data={data}
        growth={growth}
        journey={journey}
        onWindowChange={onWindowChange}
      />,
    );

    expect(screen.getByText('mystery')).toBeVisible();
    expect(screen.getByText('4 samples')).toBeVisible();
  });
});
