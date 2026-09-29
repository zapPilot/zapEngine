// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SocialGrowthJourney } from '../../shared/growth-journey.js';
import type { PipelineQueuesResponse } from '../../shared/pipeline-queues.js';
import type {
  OperationalSignal,
  OperationsResponse,
  OverviewResponse,
  PodcastCostResponse,
} from '../../shared/types.js';
import { podcastEpisodeCostFixture } from '../__fixtures__/dashboard.js';
import { TodayPage } from './TodayPage.js';

afterEach(cleanup);

const baseSignal: OperationalSignal = {
  detail: 'Cost snapshots may be stale.',
  domain: 'jobs',
  evidence: {},
  fingerprint: 'test:fingerprint',
  observedAt: new Date().toISOString(),
  source: 'github-actions',
  status: 'critical',
  title: 'something broke',
  url: 'https://github.com/zapPilot/zapEngine/actions',
};

const baseOperations: OperationsResponse = {
  domains: [],
  generatedAt: new Date().toISOString(),
  priorities: [{ reasons: ['critical status'], score: 86, signal: baseSignal }],
  signals: [baseSignal],
  status: 'critical',
};

const baseOverview = {
  generatedAt: new Date().toISOString(),
  accruedCostUsd: 12,
  projectedCostUsd: 42,
  cashInvoiceSpendUsd: 10,
  aumUsd: 1000,
  activeAccounts: 2,
  socialReach: 18,
  product: {
    registeredUsers: 10,
    verifiedWallets: 8,
    portfolioUsers: 6,
    wau: 4,
    mau: 7,
    observedPortfolioUsd: 1000,
    portfolioFresh24h: 5,
    portfolioFresh7d: 6,
    top1PortfolioShare: 0.4,
    top3PortfolioShare: 0.8,
    activePortfolios7d: 4,
  },
  providers: [],
  social: {
    status: 'ok',
    message: null,
    window: 'latest',
    generatedAt: new Date().toISOString(),
    accounts: [],
    decisions: [],
    episodes: [],
  },
} as unknown as OverviewResponse;

const baseCosts: PodcastCostResponse = {
  episodes: [podcastEpisodeCostFixture()],
  generatedAt: '2026-09-10T01:00:00Z',
  message: null,
  status: 'ok',
};

const emptyLane = { attention: [], processing: [], queued: [] };

const baseQueues: PipelineQueuesResponse = {
  api: emptyLane,
  generatedAt: new Date().toISOString(),
  message: null,
  render: emptyLane,
  social: emptyLane,
  status: 'ok',
  summary: {
    abandoned: 0,
    blockedOrFailed: 0,
    processing: 0,
    publishedToday: 0,
    queueDepth: 0,
  },
};

const baseJourney: SocialGrowthJourney = {
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

function renderToday(overrides: Partial<Parameters<typeof TodayPage>[0]> = {}) {
  const onNavigate = vi.fn();
  render(
    <TodayPage
      data={baseOverview}
      journey={baseJourney}
      onNavigate={onNavigate}
      operations={baseOperations}
      podcastCosts={baseCosts}
      queues={baseQueues}
      {...overrides}
    />,
  );
  return { onNavigate };
}

describe('TodayPage coverage2', () => {
  it('renders an action card without detail text', () => {
    const noDetail: OperationalSignal = {
      ...baseSignal,
      detail: null as unknown as string,
    };
    renderToday({
      operations: {
        ...baseOperations,
        priorities: [
          { reasons: ['critical status'], score: 86, signal: noDetail },
        ],
        signals: [noDetail],
      },
    });
    expect(screen.getByText('something broke')).toBeVisible();
    expect(screen.queryByText('Cost snapshots may be stale.')).toBeNull();
  });

  it('falls back to a neutral pill for an unknown publish status', () => {
    renderToday({
      data: baseOverview,
      queues: {
        ...baseQueues,
        social: {
          attention: [],
          processing: [],
          queued: [
            {
              contentType: 'video',
              episodeId: 'episode-1',
              history: [],
              key: 'social-episode-1',
              platforms: [
                {
                  languageCode: 'en',
                  platform: 'x',
                  retryCount: 0,
                  scheduledAt: '2026-09-10T00:00:00Z',
                  status: 'weird-status' as never,
                } as never,
              ],
              publishedLinks: [],
              scheduledAt: '2026-09-10T00:00:00Z',
              state: 'partial',
              title: 'Weird release',
            },
          ],
        },
      },
    });
    // Unknown status still renders the lane with a neutral tone.
    expect(screen.getByText('Weird release')).toBeVisible();
    expect(screen.getByText('weird-status')).toBeVisible();
  });

  it('renders telemetry-only rows with null views as a dash', () => {
    const overviewWithNullViews = {
      ...baseOverview,
      social: {
        ...baseOverview.social,
        episodes: [
          {
            episodeId: 'episode-9',
            title: 'Telemetry only',
            totalViews: null,
            totalImpressions: null,
            platforms: [
              {
                platform: 'x',
                postUrl: null,
                views: null,
                engagementRate: null,
                likes: null,
                comments: null,
                shares: null,
                saves: null,
                followersGained: null,
                averageViewDurationSec: null,
                averageViewPercentage: null,
              },
            ],
          },
        ],
      },
    } as unknown as OverviewResponse;
    renderToday({ data: overviewWithNullViews, queues: baseQueues });
    expect(screen.getByText('Telemetry only')).toBeVisible();
    // Null views render as an em dash.
    expect(screen.getByText('—')).toBeVisible();
  });

  it('renders telemetry rows when the measured platforms list is missing', () => {
    const overviewMissingPlatforms = {
      ...baseOverview,
      social: {
        ...baseOverview.social,
        episodes: [
          {
            episodeId: 'episode-10',
            title: null,
            totalViews: null,
            totalImpressions: null,
            platforms: undefined,
          },
        ],
      },
    } as unknown as OverviewResponse;
    renderToday({ data: overviewMissingPlatforms, queues: baseQueues });
    // Title falls back to empty; the section still renders without crashing.
    expect(screen.getByText('內容發佈現況')).toBeVisible();
  });

  it('renders telemetry rows with a missing title', () => {
    const overviewMissingTitle = {
      ...baseOverview,
      social: {
        ...baseOverview.social,
        episodes: [
          {
            episodeId: 'episode-11',
            title: null,
            totalViews: null,
            totalImpressions: null,
            platforms: [
              {
                platform: 'threads',
                postUrl: null,
                views: 5,
                engagementRate: null,
                likes: null,
                comments: null,
                shares: null,
                saves: null,
                followersGained: null,
                averageViewDurationSec: null,
                averageViewPercentage: null,
              },
            ],
          },
        ],
      },
    } as unknown as OverviewResponse;
    renderToday({ data: overviewMissingTitle, queues: baseQueues });
    expect(screen.getByText('5')).toBeVisible();
  });

  it('flags lanes with attention items as needing intervention', () => {
    renderToday({
      queues: {
        ...baseQueues,
        api: {
          attention: [
            {
              actions: {},
              currentStep: 'Rendering',
              history: [],
              key: 'api-stuck',
              kind: 'ingest',
              publishedLinks: [],
              retryCount: 0,
              state: 'failed',
              title: 'Stuck ingest',
            } as never,
          ],
          processing: [],
          queued: [],
        },
      },
    });
    expect(screen.getByText(/需介入 1/)).toBeVisible();
  });
});
