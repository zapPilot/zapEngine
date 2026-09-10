// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  OperationalSignal,
  OperationsResponse,
  OverviewResponse,
  PodcastCostResponse,
  SocialPerformanceResponse,
} from '../../shared/types.js';
import { ReliabilityFocusView, TodayView } from './FocusedOperatorViews.js';

afterEach(cleanup);

const social: SocialPerformanceResponse = {
  status: 'ok',
  message: null,
  window: 'latest',
  generatedAt: '2026-09-10T01:00:00Z',
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
};

const overview: OverviewResponse = {
  generatedAt: '2026-09-10T01:00:00Z',
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
  social,
};

const podcastCosts: PodcastCostResponse = {
  generatedAt: '2026-09-10T01:00:00Z',
  status: 'ok',
  message: null,
  episodes: [
    {
      episodeId: 'episode-1',
      title: 'The latest release',
      lastRunAt: '2026-09-10T00:30:00Z',
      totalCostUsd: 10,
      podcastCostUsd: 7,
      videoCostUsd: 3,
      retryWasteUsd: 1,
      runCount: 2,
      failedRuns: 1,
      unpricedStages: 0,
      breakdown: [],
    },
  ],
};

const signal: OperationalSignal = {
  fingerprint: 'github-actions:workflow/ops-cost-sync.yml',
  source: 'github-actions',
  domain: 'jobs',
  status: 'critical',
  title: 'ops-cost-sync failed 4 runs in a row',
  detail: 'Cost snapshots may be stale.',
  evidence: { failureStreak: 4 },
  observedAt: '2026-09-10T00:30:00Z',
  url: 'https://github.com/zapPilot/zapEngine/actions',
};

const operations: OperationsResponse = {
  generatedAt: '2026-09-10T01:00:00Z',
  status: 'critical',
  domains: [],
  priorities: [{ signal, score: 86, reasons: ['critical status'] }],
  signals: [signal],
};

describe('Focused operator views', () => {
  it('turns Today into an action inbox without exposing priority scores', () => {
    const onNavigate = vi.fn();
    render(
      <TodayView
        data={overview}
        onNavigate={onNavigate}
        operations={operations}
        podcastCosts={podcastCosts}
      />,
    );

    expect(screen.getByText('今天最需要你處理的事')).toBeVisible();
    expect(
      screen.getByText('ops-cost-sync failed 4 runs in a row'),
    ).toBeVisible();
    expect(screen.queryByText('86')).toBeNull();
    expect(screen.getByText('10.0%')).toBeVisible();
    expect(screen.getByText('The latest release')).toBeVisible();
  });

  it('combines operational risk and cost waste on Reliability', () => {
    render(
      <ReliabilityFocusView
        data={operations}
        overview={overview}
        podcastCosts={podcastCosts}
        social={null}
        statements={null}
      />,
    );

    expect(screen.getByText('目前風險')).toBeVisible();
    expect(screen.getByText('錢花在哪裡')).toBeVisible();
    expect(screen.getAllByText('10.0%').length).toBeGreaterThan(0);
    expect(screen.getByText('Signal evidence')).toBeInTheDocument();
  });
});

describe('Today observer trust', () => {
  it.each(['unknown', 'degraded', 'critical'] as const)(
    'does not call %s with empty priorities healthy',
    (status) => {
      render(
        <TodayView
          data={null}
          operations={{
            generatedAt: new Date().toISOString(),
            status,
            priorities: [],
            signals: [],
            domains: [],
          }}
          podcastCosts={null}
          onNavigate={vi.fn()}
        />,
      );
      expect(
        screen.queryByText('目前沒有需要你處理的 operational issue'),
      ).not.toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent('觀測資料不足');
    },
  );
  it('does not call stale healthy data recovered', () => {
    render(
      <TodayView
        data={null}
        operations={{
          generatedAt: '2000-01-01T00:00:00Z',
          status: 'healthy',
          priorities: [],
          signals: [],
          domains: [],
        }}
        podcastCosts={null}
        onNavigate={vi.fn()}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('已過期');
    expect(
      screen.queryByText('目前沒有需要你處理的 operational issue'),
    ).not.toBeInTheDocument();
  });
});
