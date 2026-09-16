// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SocialGrowthJourney } from '../../shared/growth-journey.js';
import type {
  SocialGrowthResponse,
  SocialPerformanceResponse,
} from '../../shared/types.js';
import { GrowthPage } from './GrowthPage.js';

afterEach(cleanup);

const journey: SocialGrowthJourney = {
  appVisitors30d: 6,
  ctaUsers30d: 1,
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

const social = {
  accounts: [],
  decisions: [],
  episodes: [],
  generatedAt: '2026-09-10T01:00:00Z',
  message: null,
  status: 'ok',
  window: 'latest',
} as unknown as SocialPerformanceResponse;

function renderGrowth(
  overrides: Partial<Parameters<typeof GrowthPage>[0]> = {},
) {
  const onWindowChange = vi.fn(async () => undefined);
  render(
    <GrowthPage
      data={social}
      growth={growth}
      journey={journey}
      onWindowChange={onWindowChange}
      {...overrides}
    />,
  );
  return { onWindowChange };
}

describe('GrowthPage coverage', () => {
  it('switches the telemetry window from the picker', () => {
    const { onWindowChange } = renderGrowth();

    fireEvent.click(screen.getByRole('button', { name: '7d' }));
    expect(onWindowChange).toHaveBeenCalledWith('7d');
    expect(screen.getByRole('button', { name: 'latest' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('falls back to the latest window when no telemetry has arrived', () => {
    renderGrowth({ data: null });

    expect(screen.getByRole('button', { name: 'latest' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('skips journey steps with no visitors instead of inventing a loss', () => {
    renderGrowth({
      journey: {
        ...journey,
        appVisitors30d: 0,
        landingVisitors30d: 0,
        walletConnectedUsers30d: 0,
        ctaUsers30d: 0,
      },
    });

    expect(screen.getByText('尚無可指認的流失')).toBeVisible();
  });

  it('says the waitlist is still loading when growth has not arrived', () => {
    renderGrowth({ growth: null });

    expect(screen.getByText('Loading')).toBeVisible();
  });

  it('attributes direct signups alongside platform conversions', () => {
    renderGrowth({
      growth: {
        ...growth,
        waitlist: {
          ...emptyWaitlist,
          conversions: [
            {
              episodeId: 'ep-1',
              languageCode: 'en',
              platform: 'threads',
              signupRate: null,
              signups: 3,
              socialPostId: null,
              socialPublishJobId: 'job-1',
              views24h: null,
            },
          ],
          directOrUnknown7d: 2,
          signups30d: 5,
          signups7d: 5,
          total: 5,
        },
      } as unknown as SocialGrowthResponse,
    });

    expect(screen.getByText('Direct / unknown')).toBeVisible();
  });

  it('renders content rows with missing telemetry as dashes', () => {
    renderGrowth({
      data: {
        ...social,
        episodes: [
          {
            episodeId: 'ep-1',
            platforms: [
              {
                averageViewDurationSec: null,
                averageViewPercentage: null,
                comments: null,
                engagementRate: null,
                followersGained: null,
                likes: null,
                platform: 'x',
                postUrl: 'https://x.example/1',
                saves: null,
                shares: null,
                views: null,
              },
            ],
            title: 'Sparse episode',
            totalImpressions: null,
            totalViews: 0,
          },
        ],
      } as unknown as SocialPerformanceResponse,
    });

    expect(screen.getByText('Sparse episode')).toBeVisible();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('says no release has happened yet in an empty window', () => {
    renderGrowth({ data: { ...social, episodes: [] } });

    expect(screen.getByText('No release yet')).toBeVisible();
  });

  it('drops guidance without evidence and renders sparse guidance honestly', () => {
    renderGrowth({
      data: {
        ...social,
        decisions: [
          {
            avoidHashtags: [],
            bestTopic: null,
            bestTopicLiftVsPlatformMedian: null,
            bestTopicMedian24hViews: null,
            bestTopicSamples: 0,
            confidence: 'mystery',
            evidenceSamples: 0,
            platform: 'x',
            platformMedian24hViews: null,
            preferredHashtags: [],
            preferredHookTypes: [],
            publishSlotsJst: null,
            topExample: null,
          },
          {
            avoidHashtags: [],
            bestTopic: null,
            bestTopicLiftVsPlatformMedian: null,
            bestTopicMedian24hViews: null,
            bestTopicSamples: 0,
            confidence: 'low',
            evidenceSamples: 4,
            platform: 'threads',
            platformMedian24hViews: null,
            preferredHashtags: [],
            preferredHookTypes: [],
            publishSlotsJst: null,
            topExample: null,
          },
        ],
      } as unknown as SocialPerformanceResponse,
    });

    expect(screen.getByText('4 samples')).toBeVisible();
    expect(screen.queryByText('0 samples')).toBeNull();
  });
});
