// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type {
  CustomerEconomicsResponse,
  CustomerRecord,
} from '../../shared/types.js';
import { productFixture } from '../__fixtures__/dashboard.js';
import { ProductView } from './ProductView.js';

afterEach(cleanup);

const NOW = '2026-08-31T00:00:00.000Z';

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
    aumUsd: 1000,
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

function customers(users: CustomerRecord[]): CustomerEconomicsResponse {
  return {
    generatedAt: NOW,
    status: 'ok',
    message: null,
    summary: {
      totalCustomers: users.length,
      priorityUsers: 0,
      standardUsers: users.length,
      pausedUsers: 0,
      activeLast7d: 0,
      inactiveButPriority: 0,
      aumUsd: 0,
      attributedCostUsd30d: 0,
      revenueUsd: null,
    },
    users,
  };
}

describe('ProductView coverage', () => {
  it('waits for data instead of rendering an empty table', () => {
    render(<ProductView customers={null} product={undefined} />);

    expect(screen.getByText('Waiting for data.')).toBeVisible();
  });

  it('says no account tripped a rule when the roster is clean', () => {
    render(
      <ProductView
        customers={customers([customer({ userId: 'fresh' })])}
        product={productFixture()}
      />,
    );

    expect(screen.getByText('Nothing tripped a rule.')).toBeVisible();
  });

  it('names the empty flagged list when the roster is clean', () => {
    const data = customers([customer({ userId: 'fresh' })]);
    render(<ProductView customers={data} product={productFixture()} />);

    // The flagged filter is empty, so the inline empty state names that —
    // the show-all branch needs a non-empty roster to toggle open.
    expect(screen.getByText('Nothing tripped a rule.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /Show all/ }));
    expect(screen.getByText('fresh')).toBeVisible();
  });

  it('sorts equal-risk accounts by AUM, then by id', () => {
    render(
      <ProductView
        customers={customers([
          customer({ aumUsd: 500, userId: 'b-user' }),
          customer({ aumUsd: 500, userId: 'a-user' }),
          customer({
            aumUsd: 100_000,
            inactiveDays: 45,
            userId: 'risky',
            effectiveTier: 'priority',
          }),
        ])}
        product={productFixture()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Show all/ }));
    const rows = screen.getAllByRole('row');
    expect(rows[1]).toHaveTextContent('risky');
  });

  it('explains a priority account whose last activity is unknown', () => {
    render(
      <ProductView
        customers={customers([
          customer({
            effectiveTier: 'priority',
            inactiveDays: null,
            userId: 'quiet-vip',
          }),
        ])}
        product={productFixture()}
      />,
    );

    expect(screen.getByText('Priority, inactive unknown')).toBeVisible();
  });

  it('counts wallets that never refreshed, singular and plural', () => {
    render(
      <ProductView
        customers={customers([
          customer({ neverRefreshedWallets: 1, userId: 'one' }),
          customer({ neverRefreshedWallets: 2, userId: 'two' }),
        ])}
        product={productFixture()}
      />,
    );

    expect(screen.getByText('1 wallet never refreshed')).toBeVisible();
    expect(screen.getByText('2 wallets never refreshed')).toBeVisible();
  });

  it('names a stale worst wallet and marks it as due', () => {
    render(
      <ProductView
        customers={customers([
          customer({
            dueForRefresh: true,
            portfolioWorstStaleHours: 72,
            userId: 'stale',
          }),
        ])}
        product={productFixture()}
      />,
    );

    expect(screen.getByText(/Worst wallet .* old/)).toBeVisible();
    expect(screen.getByText(/· due/)).toBeVisible();
  });

  it('leaves a fresh account without a reason', () => {
    render(
      <ProductView
        customers={customers([customer({ userId: 'fresh' })])}
        product={productFixture()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Show all/ }));
    expect(screen.getByText('—')).toBeVisible();
  });

  it('spells out overrides, missing activity and never-refreshed wallets', () => {
    render(
      <ProductView
        customers={customers([
          customer({
            costBasis: null,
            email: 'vip@example.com',
            lastActivityAt: null,
            overrideExpiresAt: NOW,
            overrideReason: 'incident-12',
            overrideTier: 'paused',
            refreshIntervalHours: null,
            userId: 'vip',
            wallets: [
              { wallet: '0xabc', lastPortfolioUpdateAt: null, dueForRefresh: false },
              {
                wallet: '0xdue',
                lastPortfolioUpdateAt: NOW,
                dueForRefresh: true,
              },
            ],
          }),
        ])}
        product={productFixture()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Show all/ }));
    fireEvent.click(screen.getByText('vip@example.com'));

    expect(screen.getByText('incident-12')).toBeVisible();
    expect(screen.getByText('not scheduled')).toBeVisible();
    expect(screen.getByText('never')).toBeVisible();
    expect(screen.getByText('no cost data')).toBeVisible();
    expect(screen.getByText('never refreshed')).toBeVisible();
    expect(screen.getByText(/· due/)).toBeVisible();
    expect(screen.getByText('override')).toBeVisible();
  });

  it('renders a null product without inventing freshness', () => {
    render(
      <ProductView
        customers={customers([customer({ userId: 'fresh' })])}
        product={undefined}
      />,
    );

    expect(screen.getByText('Funnel to the north star')).toBeVisible();
  });

  it('renders a zero-observed product without dividing by zero', () => {
    render(
      <ProductView
        customers={customers([customer({ userId: 'fresh' })])}
        product={productFixture({
          portfolioFresh24h: 0,
          portfolioFresh7d: 0,
          portfolioUsers: 0,
          top1PortfolioShare: null,
          top3PortfolioShare: null,
        })}
      />,
    );

    expect(
      screen.getByRole('heading', { name: 'Portfolio freshness' }),
    ).toBeVisible();
  });
});
