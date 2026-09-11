// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SocialGrowthJourney } from '../../shared/growth-journey.js';
import type {
  SocialGrowthResponse,
  SocialPerformanceResponse,
} from '../../shared/types.js';
import { GrowthPage } from './GrowthPage.js';

afterEach(cleanup);

beforeEach(() => {
  // GrowthJourneyPanel fetches its own PostHog read.
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.reject(new Error('journey unavailable'))),
  );
});

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

const social = {
  accounts: [],
  decisions: [
    {
      avoidHashtags: [],
      bestTopic: 'macro',
      bestTopicLiftVsPlatformMedian: null,
      bestTopicMedian24hViews: null,
      bestTopicSamples: 12,
      confidence: 'high',
      evidenceSamples: 53,
      platform: 'threads',
      platformMedian24hViews: null,
      preferredHashtags: [],
      preferredHookTypes: ['contrarian'],
      publishSlotsJst: '09:30 / 12:00',
      topExample: null,
    },
  ],
  episodes: [
    {
      episodeId: 'ep-1',
      platforms: [
        {
          averageViewDurationSec: null,
          averageViewPercentage: null,
          comments: null,
          engagementRate: 0,
          followersGained: null,
          likes: null,
          platform: 'youtube',
          postUrl: null,
          saves: null,
          shares: null,
          views: 0,
        },
      ],
      title: '一集沒有人看的內容',
      totalImpressions: null,
      totalViews: 0,
    },
  ],
  generatedAt: '2026-09-10T01:00:00Z',
  message: null,
  status: 'ok',
  window: 'latest',
} as unknown as SocialPerformanceResponse;

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

function renderGrowth(
  overrides: Partial<Parameters<typeof GrowthPage>[0]> = {},
) {
  return render(
    <GrowthPage
      data={social}
      growth={growth}
      journey={journey}
      onWindowChange={vi.fn(async () => undefined)}
      {...overrides}
    />,
  );
}

describe('Growth waitlist reporting', () => {
  it('does not draw a share ring when nothing has been attributed', () => {
    const { container } = renderGrowth();
    expect(container.querySelector('.cc-donut')).toBeNull();
    expect(screen.getByText('尚無來源分佈')).toBeVisible();
  });

  it('draws the ring once a source carries signups', () => {
    const { container } = renderGrowth({
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
          signups30d: 3,
          signups7d: 3,
          total: 3,
        },
      } as SocialGrowthResponse,
    });
    const donut = container.querySelector('.cc-donut');
    expect(donut).not.toBeNull();
    // Threads also names the learned-guidance row, so scope to the legend.
    expect(donut?.querySelector('.cc-donut-legend')?.textContent).toContain(
      'Threads',
    );
  });

  it('reports an unavailable waitlist rather than zero signups', () => {
    renderGrowth({
      growth: {
        ...growth,
        waitlist: {
          attributedSocial7d: null,
          conversions: [],
          directOrUnknown7d: null,
          message: 'Waitlist table is not reachable',
          signups30d: null,
          signups7d: null,
          status: 'unavailable',
          total: null,
        },
      } as SocialGrowthResponse,
    });
    expect(screen.getByText('Waitlist 無法取得')).toBeVisible();
  });
});

describe('Growth drop-off reading', () => {
  it('names the journey steps that lose the most people', () => {
    renderGrowth();
    expect(screen.getByText('到站訪客沒有點擊 Waitlist CTA')).toBeVisible();
    expect(screen.getByText(/179 人之中有 178 人/)).toBeVisible();
  });

  it('surfaces published posts that were never seen', () => {
    renderGrowth();
    expect(screen.getByText('1 篇貼文的觀看數是 0')).toBeVisible();
  });

  it('says nothing when analytics is unavailable', () => {
    renderGrowth({
      data: { ...social, episodes: [] } as SocialPerformanceResponse,
      journey: {
        appVisitors30d: null,
        ctaUsers30d: null,
        landingDirect30d: null,
        landingOther30d: null,
        landingRednote30d: null,
        landingThreads30d: null,
        landingVisitors30d: null,
        landingX30d: null,
        landingYoutube30d: null,
        message: 'PostHog is not configured',
        status: 'unavailable',
        walletConnectedUsers30d: null,
      },
    });
    expect(screen.getByText('尚無可指認的流失')).toBeVisible();
  });
});

describe('Growth guidance', () => {
  it('shows learned guidance with its sample coverage, not an invented impact score', () => {
    renderGrowth();
    expect(screen.getByText('53 samples')).toBeVisible();
    expect(screen.getByText('high')).toBeVisible();
    expect(screen.queryByText('高影響')).toBeNull();
  });
});
