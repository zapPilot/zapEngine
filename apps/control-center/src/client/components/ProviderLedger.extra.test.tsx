// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { CostProviderResult } from '../../shared/types.js';
import {
  costProviderFixture,
  flyRunRateProviderFixture,
  unrecordedFlyProviderFixture,
} from '../__fixtures__/dashboard.js';
import { ProviderLedger, UsageSignals } from './ProviderLedger.js';

afterEach(cleanup);

function ledgerRow(provider: string): HTMLElement {
  const cell = screen.getByRole('cell', { name: provider });
  return cell.closest('tr') as HTMLElement;
}

function errorProvider(): CostProviderResult {
  return costProviderFixture({
    provider: 'brave',
    label: 'Brave',
    status: 'error',
    message: 'API key expired',
  });
}

describe('ProviderLedger coverage', () => {
  it('hides the projected column outside the audit disclosure', () => {
    render(<ProviderLedger providers={[costProviderFixture()]} />);

    expect(screen.queryByText('Projected')).toBeNull();
    expect(screen.getByText('Accrued')).toBeVisible();
  });

  it('says no provider is configured rather than rendering an empty table', () => {
    render(<ProviderLedger detailed providers={[]} />);

    expect(screen.getByText('No providers configured.')).toBeVisible();
  });

  it('renders an unpriced provider row without inventing figures', () => {
    render(<ProviderLedger detailed providers={[unrecordedFlyProviderFixture()]} />);

    const row = ledgerRow('Fly.io');
    expect(within(row).getByText('Not connected')).toBeInTheDocument();
    expect(row).toHaveTextContent('Needs current estimate');
    expect(within(row).getAllByText('—').length).toBeGreaterThan(0);
  });

  it('flags a failing provider beside its remedy', () => {
    render(<ProviderLedger detailed providers={[errorProvider()]} />);

    const row = ledgerRow('Brave');
    expect(within(row).getByText('Needs attention')).toBeInTheDocument();
    expect(row).toHaveTextContent('API key expired');
  });

  it('prints a run-rate with its qualifier, not as money owed', () => {
    render(
      <ProviderLedger detailed providers={[flyRunRateProviderFixture()]} />,
    );

    const row = ledgerRow('Fly.io');
    expect(within(row).getByText('run-rate')).toBeInTheDocument();
    expect(row).toHaveTextContent('$67.70');
  });
});

describe('UsageSignals coverage', () => {
  it('says credentials are missing when no provider reports usage', () => {
    render(<UsageSignals providers={[unrecordedFlyProviderFixture()]} />);

    expect(
      screen.getByText('Add provider credentials on the server to see usage signals.'),
    ).toBeVisible();
  });

  it('prints money usage as money and counts as counts', () => {
    render(
      <UsageSignals
        providers={[
          costProviderFixture(),
          costProviderFixture({
            provider: 'debank',
            label: 'DeBank',
            snapshot: {
              accruedCostUsd: 3.55,
              costType: 'list-price-equivalent',
              fetchedAt: '2026-08-28T12:00:00.000Z',
              periodEnd: '2026-08-28T12:00:00.000Z',
              periodStart: '2026-08-01T00:00:00.000Z',
              projectedCostUsd: 3.9,
              provider: 'debank',
              source: 'api',
              usage: [
                {
                  key: 'monthly_units',
                  label: 'Units this month',
                  unit: 'units',
                  value: 2220,
                },
              ],
            },
          }),
        ]}
      />,
    );

    expect(screen.getByText('OpenRouter')).toBeVisible();
    expect(screen.getByText('$6.12')).toBeVisible();
    expect(screen.getByText('2,220')).toBeVisible();
  });
});
