// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';

import type {
  CustomerEconomicsResponse,
  CustomerRecord,
  PodcastCostResponse,
  SocialGrowthResponse,
} from '../../shared/types.js';
import {
  operationsFixture,
  productFixture,
} from '../__fixtures__/dashboard.js';
import { unavailableWaitlist } from '../../shared/waitlist-growth.js';
import type { StatementsResponse } from '../../shared/statements.js';
import { ruleProductDemand } from '../../server/services/statements/product-demand.js';
import type { StatementInputs } from '../../server/services/statements/types.js';
import { PodcastUnitEconomics } from './PodcastUnitEconomics.js';
import { ProductView } from './ProductView.js';

afterEach(cleanup);

const NOW = '2026-08-31T00:00:00.000Z';

function podcastCosts(): PodcastCostResponse {
  return {
    generatedAt: NOW,
    status: 'ok',
    message: null,
    episodes: [
      {
        episodeId: 'ep-expensive',
        title: 'Expensive episode',
        lastRunAt: NOW,
        totalCostUsd: 1.2,
        podcastCostUsd: 0.4,
        videoCostUsd: 0.8,
        retryWasteUsd: 0.2,
        runCount: 3,
        failedRuns: 1,
        unpricedStages: 1,
        breakdown: [
          { label: 'Fish TTS', costUsd: 0.3, operations: 2 },
          { label: 'ja render', costUsd: 0.8, operations: 1 },
        ],
      },
      {
        episodeId: 'ep-cheap',
        title: 'Cheap episode',
        lastRunAt: '2026-08-30T00:00:00.000Z',
        totalCostUsd: 0.4,
        podcastCostUsd: 0.2,
        videoCostUsd: 0.2,
        retryWasteUsd: 0,
        runCount: 1,
        failedRuns: 0,
        unpricedStages: 0,
        breakdown: [{ label: 'LLM', costUsd: 0.2, operations: 1 }],
      },
    ],
  };
}

function customer(
  overrides: Partial<CustomerRecord> & Pick<CustomerRecord, 'userId'>,
): CustomerRecord {
  const { userId, ...rest } = overrides;
  return {
    userId,
    email: null,
    planCode: 'standard',
    defaultTier: 'standard',
    overrideTier: null,
    overrideReason: null,
    overrideExpiresAt: null,
    effectiveTier: 'standard',
    refreshIntervalHours: 168,
    lastActivityAt: NOW,
    inactiveDays: 0,
    aumUsd: 1_000,
    wallets: [
      {
        wallet: '0x123',
        lastPortfolioUpdateAt: NOW,
        dueForRefresh: false,
      },
    ],
    portfolioStaleHours: 1,
    portfolioWorstStaleHours: 1,
    neverRefreshedWallets: 0,
    dueForRefresh: false,
    requestCount30d: 10,
    attributedCostUsd30d: 0.5,
    costBasis: 'allocated_estimate',
    revenueUsd: null,
    ...rest,
  };
}

function customers(): CustomerEconomicsResponse {
  return {
    generatedAt: NOW,
    status: 'ok',
    message: null,
    summary: {
      totalCustomers: 2,
      priorityUsers: 1,
      standardUsers: 1,
      pausedUsers: 0,
      activeLast7d: 1,
      inactiveButPriority: 1,
      aumUsd: 101_000,
      attributedCostUsd30d: 2,
      revenueUsd: null,
    },
    users: [
      customer({
        userId: 'high-aum-standard',
        email: 'standard@example.com',
        aumUsd: 100_000,
      }),
      customer({
        userId: 'risk-priority',
        email: 'risk@example.com',
        planCode: 'vip',
        defaultTier: 'priority',
        effectiveTier: 'priority',
        refreshIntervalHours: 24,
        inactiveDays: 45,
        aumUsd: 1_000,
        portfolioWorstStaleHours: 72,
        dueForRefresh: true,
      }),
    ],
  };
}

function growth(): SocialGrowthResponse {
  return {
    waitlist: unavailableWaitlist('Not collected'),
    generatedAt: NOW,
    status: 'ok',
    message: null,
    platforms: [
      {
        platform: 'x',
        followersNow: 240,
        followersDelta24h: 2,
        followersDelta7d: 9,
        exactSubscribersGained7d: null,
        lanes: [
          {
            languageCode: 'en',
            postCount7d: 3,
            medianReach24h: 500,
            followersGained7d: 2,
            followersPer1kReach: 1.2,
            basis: 'estimated',
          },
          {
            languageCode: 'ja',
            postCount7d: 3,
            medianReach24h: 700,
            followersGained7d: 4,
            followersPer1kReach: 2.4,
            basis: 'estimated',
          },
        ],
      },
    ],
    experiments: [
      {
        experimentKey: 'x-language-v1',
        kind: 'language',
        paired: true,
        status: 'paired-cohort',
        arms: [],
      },
    ],
    attribution: [
      {
        platform: 'x',
        startAt: '2026-08-30T00:00:00.000Z',
        endAt: NOW,
        netDelta: 2,
        unattributed: 1,
        posts: [],
        basis: 'estimated',
      },
    ],
  };
}

describe('decision-first domain views', () => {
  it('keeps podcast stage accounting behind an episode disclosure', () => {
    render(<PodcastUnitEconomics data={podcastCosts()} />);

    expect(screen.getByText('Average / episode')).toBeVisible();
    expect(screen.getAllByText('Failed attempt cost')[0]).toBeVisible();
    expect(
      screen.queryByRole('columnheader', { name: 'Breakdown' }),
    ).toBeNull();
    expect(screen.getByText(/Fish TTS/)).not.toBeVisible();

    const episode = screen
      .getByText('Expensive episode', {
        selector: '.podcast-episode-title strong',
      })
      .closest('details');
    expect(episode).not.toBeNull();
    fireEvent.click(within(episode!).getByText('Expensive episode'));
    expect(within(episode!).getByText(/Fish TTS/)).toBeVisible();
    expect(within(episode!).getByText('Stage breakdown')).toBeVisible();
  });

  it('shows only the flagged account by default, ranked ahead of AUM once expanded', () => {
    render(<ProductView customers={customers()} product={productFixture()} />);

    let rows = screen.getAllByRole('row');
    expect(rows).toHaveLength(2);
    expect(rows[1]).toHaveTextContent('risk@example.com');
    expect(screen.queryByRole('columnheader', { name: 'Revenue' })).toBeNull();
    expect(screen.queryByRole('columnheader', { name: /30d cost/ })).toBeNull();
    fireEvent.click(screen.getByText('risk@example.com'));
    expect(screen.getByText('Attributed cost (30d)')).toBeVisible();
    expect(screen.getByText('Refresh interval')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: /Show all/ }));
    rows = screen.getAllByRole('row');
    expect(rows[1]).toHaveTextContent('risk@example.com');
    expect(rows[rows.length - 1]).toHaveTextContent('standard@example.com');
  });
});
it('renders persisted waitlist evidence on the product surface', () => {
  const socialGrowth = growth();
  socialGrowth.waitlist = {
    status: 'ok',
    message: null,
    total: 42,
    signups7d: 5,
    signups30d: 12,
    attributedSocial7d: 3,
    directOrUnknown7d: 2,
    conversions: [],
  };
  const finding = ruleProductDemand({
    operations: operationsFixture(),
    socialGrowth,
  } as StatementInputs);
  const statements: StatementsResponse = {
    generatedAt: NOW,
    headers: [
      {
        domain: 'product',
        status: finding.status,
        sentence: finding.segments,
        facts: [finding.fact!],
      },
    ],
    statements: [
      {
        domain: 'product',
        status: finding.status,
        score: 0,
        sentence: finding.segments,
        kicker: 'Product',
        series: [],
        value: '',
        delta: '',
        deltaTone: 'neutral',
        evidenceRef: 'product',
        url: null,
      },
    ],
  };
  render(
    <ProductView
      customers={customers()}
      product={productFixture()}
      statements={statements}
    />,
  );
  expect(
    screen.getAllByText('42 total waitlist signups').length,
  ).toBeGreaterThan(0);
});
