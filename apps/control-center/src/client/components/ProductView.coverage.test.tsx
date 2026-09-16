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

describe('ProductView coverage', () => {
  it('exercises the disabled service-tier control without a mutation endpoint', () => {
    render(
      <ProductView
        customers={customers([
          customer({
            effectiveTier: 'priority',
            inactiveDays: 45,
            userId: 'vip',
          }),
        ])}
        product={productFixture()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Show all/ }));
    fireEvent.click(screen.getByText('vip'));

    const select = screen.getByLabelText('Service tier');
    expect(select).toBeDisabled();
    fireEvent.change(select, { target: { value: 'paused' } });
    expect(select).toHaveValue('priority');
    expect(screen.getByText(/Apply overrides in SQL/)).toBeVisible();
  });

  it('names a null ledger message as no customers returned', () => {
    render(
      <ProductView
        customers={customers([], { message: null })}
        product={productFixture()}
      />,
    );

    // No users at all: the flagged filter is empty, the toggle stays hidden,
    // and the showAll=false empty copy reads as a clean roster.
    expect(screen.getByText('Nothing tripped a rule.')).toBeVisible();
  });

  it('collapses an expanded row on a second click', () => {
    render(
      <ProductView
        customers={customers([
          customer({
            effectiveTier: 'priority',
            inactiveDays: 45,
            userId: 'vip',
          }),
        ])}
        product={productFixture()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Show all/ }));
    fireEvent.click(screen.getByText('vip'));
    expect(screen.getByText('Refresh interval')).toBeVisible();

    fireEvent.click(screen.getByText('vip'));
    expect(screen.queryByText('Refresh interval')).toBeNull();
  });

  it('marks a null worst-stale age as fresh', () => {
    render(
      <ProductView
        customers={customers([
          customer({
            portfolioWorstStaleHours: null,
            userId: 'null-age',
          }),
        ])}
        product={productFixture()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Show all/ }));
    expect(screen.getByText('never')).toBeVisible();
  });

  it('renders a paused override without an expiry', () => {
    render(
      <ProductView
        customers={customers([
          customer({
            email: 'paused@example.com',
            effectiveTier: 'paused',
            overrideTier: 'paused',
            overrideReason: null,
            overrideExpiresAt: null,
            userId: 'paused',
          }),
        ])}
        product={productFixture()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Show all/ }));
    fireEvent.click(screen.getByText('paused@example.com'));
    expect(screen.getAllByText('paused').length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText('Reason')).toBeNull();
    expect(screen.queryByText('Expires')).toBeNull();
  });
});
