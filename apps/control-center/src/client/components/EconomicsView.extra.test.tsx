// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { StatementsResponse } from '../../shared/statements.js';
import type { OverviewResponse } from '../../shared/types.js';
import {
  costProvidersFixture,
  costProviderFixture,
  costSnapshotFixture,
  overviewFixture,
} from '../__fixtures__/dashboard.js';
import { EconomicsView } from './EconomicsView.js';

afterEach(cleanup);

function statements(): StatementsResponse {
  return {
    generatedAt: '2026-08-28T12:00:00.000Z',
    headers: [
      {
        domain: 'spend',
        status: 'healthy',
        sentence: [{ text: 'Spend is within expectations at ' }, { value: '$41.30', tone: 'neutral' }],
        facts: [{ kicker: 'Accrued', value: '$26.96', note: 'to date' }],
      },
    ],
    statements: [],
  };
}

describe('EconomicsView coverage', () => {
  it('leads with the spend statement when one was composed', () => {
    render(
      <EconomicsView
        data={overviewFixture({ providers: costProvidersFixture() })}
        history={null}
        podcastCosts={null}
        statements={statements()}
      />,
    );

    expect(screen.getByText(/Spend is within expectations/)).toBeVisible();
    const header = screen
      .getByText(/Spend is within expectations/)
      .closest('.statement-header') as HTMLElement;
    expect(within(header).getByText('Accrued')).toBeVisible();
  });

  it('says no provider has reported a cost yet', () => {
    render(
      <EconomicsView
        data={overviewFixture({ providers: [] })}
        history={null}
        podcastCosts={null}
      />,
    );

    expect(screen.getByText('No provider cost snapshots yet.')).toBeVisible();
    // The audit disclosure starts closed, so its empty state is present but hidden.
    expect(
      screen.getByText('Add provider credentials on the server to see usage signals.'),
    ).toBeInTheDocument();
  });

  it('flags a costed provider that needs attention', () => {
    const providers = costProvidersFixture();
    render(
      <EconomicsView
        data={overviewFixture({
          providers: providers.map((provider) =>
            provider.provider === 'openrouter'
              ? { ...provider, status: 'error' as const }
              : provider,
          ),
        })}
        history={null}
        podcastCosts={null}
      />,
    );

    const drivers = screen
      .getByRole('heading', { name: 'Where the money is going' })
      .closest('section') as HTMLElement;
    expect(within(drivers).getByText('Needs attention')).toBeVisible();
  });

  it('renders a zero-cost provider without dividing by zero', () => {
    render(
      <EconomicsView
        data={overviewFixture({
          providers: [
            costProviderFixture({
              snapshot: costSnapshotFixture({
                accruedCostUsd: 0,
                projectedCostUsd: 0,
              }),
            }),
          ],
        })}
        history={null}
        podcastCosts={null}
      />,
    );

    const drivers = screen
      .getByRole('heading', { name: 'Where the money is going' })
      .closest('section') as HTMLElement;
    expect(within(drivers).getByText('OpenRouter')).toBeVisible();
    expect(within(drivers).getByText('$0.00')).toBeVisible();
  });

  it('renders without any data rather than inventing figures', () => {
    render(<EconomicsView data={null} history={null} podcastCosts={null} />);

    expect(screen.getByText('No provider cost snapshots yet.')).toBeVisible();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });
});
