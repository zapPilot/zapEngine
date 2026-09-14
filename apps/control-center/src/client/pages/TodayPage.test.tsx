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
import { TodayPage } from './TodayPage.js';

afterEach(cleanup);

const signal: OperationalSignal = {
  detail: 'Cost snapshots may be stale.',
  domain: 'jobs',
  evidence: { failureStreak: 4 },
  fingerprint: 'github-actions:workflow/ops-cost-sync.yml',
  observedAt: new Date().toISOString(),
  source: 'github-actions',
  status: 'critical',
  title: 'ops-cost-sync failed 4 runs in a row',
  url: 'https://github.com/zapPilot/zapEngine/actions',
};

const operations: OperationsResponse = {
  domains: [],
  generatedAt: new Date().toISOString(),
  priorities: [{ reasons: ['critical status'], score: 86, signal }],
  signals: [signal],
  status: 'critical',
};

const overview = {
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
    episodes: [
      {
        episodeId: 'episode-1',
        title: 'The latest release',
        totalViews: 120,
        totalImpressions: null,
        platforms: [
          {
            platform: 'threads',
            postUrl: 'https://example.com/threads',
            views: 120,
            engagementRate: 0.04,
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
} as OverviewResponse;

const podcastCosts: PodcastCostResponse = {
  episodes: [
    {
      breakdown: [],
      episodeId: 'episode-1',
      failedRuns: 1,
      lastRunAt: '2026-09-10T00:30:00Z',
      podcastCostUsd: 7,
      retryWasteUsd: 1,
      runCount: 2,
      title: 'The latest release',
      totalCostUsd: 10,
      unpricedStages: 0,
      videoCostUsd: 3,
    },
  ],
  generatedAt: '2026-09-10T01:00:00Z',
  message: null,
  status: 'ok',
};

const emptyLane = { attention: [], processing: [], queued: [] };

const queues: PipelineQueuesResponse = {
  api: emptyLane,
  generatedAt: new Date().toISOString(),
  message: null,
  render: emptyLane,
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
            platform: 'threads',
            retryCount: 0,
            scheduledAt: '2026-09-10T00:00:00Z',
            status: 'published',
            url: 'https://example.com/threads',
          },
          {
            languageCode: 'zh-Hant',
            platform: 'rednote',
            retryCount: 0,
            scheduledAt: '2026-09-10T00:00:00Z',
            status: 'queued',
          },
        ],
        publishedLinks: [],
        scheduledAt: '2026-09-10T00:00:00Z',
        state: 'partial',
        title: 'The latest release',
      },
    ],
  },
  status: 'ok',
  summary: {
    abandoned: 0,
    blockedOrFailed: 0,
    processing: 0,
    publishedToday: 0,
    queueDepth: 1,
  },
};

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

function renderToday(overrides: Partial<Parameters<typeof TodayPage>[0]> = {}) {
  return render(
    <TodayPage
      data={overview}
      journey={journey}
      onNavigate={vi.fn()}
      operations={operations}
      podcastCosts={podcastCosts}
      queues={queues}
      {...overrides}
    />,
  );
}

describe('Today as an action inbox', () => {
  it('leads with what needs doing and never shows a priority score', () => {
    renderToday();
    expect(screen.getByText('今天最需要你處理的事')).toBeVisible();
    expect(
      screen.getByText('ops-cost-sync failed 4 runs in a row'),
    ).toBeVisible();
    expect(screen.queryByText('86')).toBeNull();
  });

  it('reports retry waste as a share of podcast spend', () => {
    renderToday();
    expect(screen.getByText('10.0%')).toBeVisible();
  });

  it('shows every publish lane of the latest release, not only measured ones', () => {
    renderToday();
    expect(screen.getByText('The latest release')).toBeVisible();
    expect(screen.getByText('published')).toBeVisible();
    expect(screen.getByText('queued')).toBeVisible();
  });

  it('does not attach measured views to a different queued episode', () => {
    const other = {
      ...queues.social.queued[0]!,
      episodeId: 'episode-2',
      key: 'social-episode-2',
      title: 'Different queued release',
    };
    renderToday({
      queues: {
        ...queues,
        social: { attention: [], processing: [], queued: [other] },
      },
    });
    expect(screen.getByText('The latest release')).toBeVisible();
    expect(screen.getByText('120')).toBeVisible();
    expect(screen.queryByText('Different queued release')).toBeNull();
    expect(screen.queryByText('published')).toBeNull();
  });

  it('reports queue depth without inventing a capacity', () => {
    renderToday();
    expect(screen.getByText(/處理中 0 · 排隊 1/)).toBeVisible();
  });
});

describe('Today observer trust', () => {
  it.each(['unknown', 'degraded', 'critical'] as const)(
    'does not call %s with empty priorities healthy',
    (status) => {
      renderToday({
        data: null,
        operations: {
          domains: [],
          generatedAt: new Date().toISOString(),
          priorities: [],
          signals: [],
          status,
        },
        podcastCosts: null,
      });
      expect(
        screen.queryByText('目前沒有需要你處理的 operational issue'),
      ).not.toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent('觀測資料不足');
    },
  );

  it('does not call stale healthy data recovered', () => {
    renderToday({
      data: null,
      operations: {
        domains: [],
        generatedAt: '2000-01-01T00:00:00Z',
        priorities: [],
        signals: [],
        status: 'healthy',
      },
      podcastCosts: null,
    });
    expect(screen.getByRole('status')).toHaveTextContent('已過期');
    expect(
      screen.queryByText('目前沒有需要你處理的 operational issue'),
    ).not.toBeInTheDocument();
  });
});

describe('Today degradation', () => {
  it('names the ledger failure instead of reporting zero waste', () => {
    renderToday({
      podcastCosts: {
        episodes: [],
        generatedAt: new Date().toISOString(),
        message: 'column ops_pipeline_stage_runs.execution_id does not exist',
        status: 'error',
      },
    });
    expect(screen.getByText(/execution_id does not exist/)).toBeInTheDocument();
  });

  it('reports an unavailable analytics read rather than an empty funnel', () => {
    renderToday({
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
        message: 'PostHog credentials are not configured',
        status: 'unavailable',
        walletConnectedUsers30d: null,
      },
    });
    expect(screen.getByText('Analytics 無法取得')).toBeInTheDocument();
  });

  it('does not put a conversion rate across the cross-source step', () => {
    renderToday();
    // landing -> CTA and app -> wallet are same-source PostHog steps.
    expect(screen.getByText('0.6%')).toBeVisible();
    expect(screen.getByText('16.7%')).toBeVisible();
    // CTA -> app visitors is dashed, so no ratio is offered between them.
    expect(screen.queryByText('600.0%')).toBeNull();
  });
});
