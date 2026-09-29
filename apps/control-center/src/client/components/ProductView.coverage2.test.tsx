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

function customers(
  users: CustomerRecord[],
  overrides: Partial<CustomerEconomicsResponse> = {},
): CustomerEconomicsResponse {
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
    ...overrides,
  };
}

describe('ProductView missing branches', () => {
  it('names a null message when showing all with an empty roster', () => {
    const { rerender } = render(
      <ProductView
        customers={customers([customer({ userId: 'seed' })])}
        product={productFixture()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Show all/ }));
    rerender(
      <ProductView
        customers={customers([], { message: null })}
        product={productFixture()}
      />,
    );
    expect(screen.getByText('No customers returned.')).toBeVisible();
  });

  it('surfaces the ledger message when showing all with an empty roster', () => {
    const { rerender } = render(
      <ProductView
        customers={customers([customer({ userId: 'seed' })])}
        product={productFixture()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Show all/ }));
    rerender(
      <ProductView
        customers={customers([], { message: 'ledger is down' })}
        product={productFixture()}
      />,
    );
    expect(screen.getByText('ledger is down')).toBeVisible();
  });

  it('sorts a priority account with unknown inactivity without crashing', () => {
    render(
      <ProductView
        customers={customers([
          customer({
            effectiveTier: 'priority',
            inactiveDays: null,
            userId: 'vip-unknown',
          }),
          customer({ userId: 'other' }),
        ])}
        product={productFixture()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Show all/ }));
    expect(screen.getByText('vip-unknown')).toBeVisible();
  });

  it('sorts null stale ages as fresh in the decision order', () => {
    render(
      <ProductView
        customers={customers([
          customer({
            portfolioWorstStaleHours: 100,
            userId: 'stale',
          }),
          customer({
            portfolioWorstStaleHours: null,
            userId: 'fresh-null',
          }),
        ])}
        product={productFixture()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Show all/ }));
    expect(screen.getByText('stale')).toBeVisible();
    expect(screen.getByText('fresh-null')).toBeVisible();
  });
});
