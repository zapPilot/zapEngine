// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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
    episodes: [],
  },
} as unknown as OverviewResponse;

const podcastCosts: PodcastCostResponse = {
  episodes: [podcastEpisodeCostFixture()],
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

function renderToday(overrides: Partial<Parameters<typeof TodayPage>[0]> = {}) {
  const onNavigate = vi.fn();
  render(
    <TodayPage
      data={overview}
      journey={journey}
      onNavigate={onNavigate}
      operations={operations}
      podcastCosts={podcastCosts}
      queues={queues}
      {...overrides}
    />,
  );
  return { onNavigate };
}

describe('TodayPage coverage', () => {
  it('navigates from every view-all link', () => {
    const { onNavigate } = renderToday();

    for (const link of screen.getAllByRole('button', { name: '查看全部' })) {
      fireEvent.click(link);
    }
    fireEvent.click(screen.getByRole('button', { name: '查看詳情' }));
    fireEvent.click(screen.getByRole('button', { name: '查看成長' }));
    fireEvent.click(screen.getByRole('button', { name: '查看可靠性' }));

    expect(onNavigate).toHaveBeenCalledWith('reliability');
    expect(onNavigate).toHaveBeenCalledWith('pipeline');
    expect(onNavigate).toHaveBeenCalledWith('growth');
  });

  it('navigates from the top action card', () => {
    const { onNavigate } = renderToday();

    fireEvent.click(screen.getByRole('button', { name: '立即處理' }));
    expect(onNavigate).toHaveBeenCalled();
  });

  it('waits for operational signals when none have arrived', () => {
    renderToday({ operations: null });

    expect(screen.getByText('Waiting for operational signals.')).toBeVisible();
  });

  it('says no release exists when telemetry and queue are both empty', () => {
    renderToday({ data: null, queues: null });

    expect(screen.getByText('No recent release')).toBeVisible();
  });

  it('treats a non-ok queue as no release rather than joining telemetry', () => {
    renderToday({
      queues: { ...queues, message: 'Queue read failed', status: 'error' },
    });

    expect(screen.getByText('No recent release')).toBeVisible();
  });

  it('waits for analytics when the journey has not loaded', () => {
    renderToday({ journey: null });

    expect(screen.getByText('Loading')).toBeVisible();
  });

  it('treats an unreadable timestamp as stale rather than current', () => {
    renderToday({
      operations: { ...operations, generatedAt: 'not-a-timestamp' },
    });

    expect(screen.getByRole('status')).toHaveTextContent('已過期');
  });

  it('renders a zero-denominator funnel without a rate', () => {
    renderToday({
      journey: {
        ...journey,
        appVisitors30d: 0,
        ctaUsers30d: 0,
        discordCtaUsers30d: 0,
        discordCtaPostWaitlistUsers30d: 0,
        landingVisitors30d: 0,
        walletConnectedUsers30d: 0,
      },
    });

    expect(screen.getByText('成長摘要')).toBeVisible();
    expect(screen.queryByText('NaN%')).toBeNull();
  });

  it('celebrates a healthy inbox with no interventions', () => {
    renderToday({
      operations: {
        domains: [],
        generatedAt: new Date().toISOString(),
        priorities: [],
        signals: [],
        status: 'healthy',
      },
    });

    expect(
      screen.getByText('目前沒有需要你處理的 operational issue'),
    ).toBeVisible();
  });
});
