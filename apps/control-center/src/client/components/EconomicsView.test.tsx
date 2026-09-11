// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { cleanup, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  manualFlyProviderFixture,
  pricedCostProvidersFixture,
  scrapedFlyProviderFixture,
  unrecordedFlyProviderFixture,
} from '../__fixtures__/dashboard.js';
import { renderEconomicsView } from '../__fixtures__/render.js';

afterEach(cleanup);

/**
 * The same dollar figures are printed three or four times over — the KPI
 * band, the chart's hit-target summaries, the cost-driver bars and the ledger
 * — so an unscoped query proves nothing about the surface under test.
 */
function kpiBand(): HTMLElement {
  return screen.getByRole('region', { name: 'Operating cost' });
}

function kpiGroup(label: string): HTMLElement {
  const heading = within(kpiBand()).getByText(label);
  return heading.closest('.kpi-group') as HTMLElement;
}

function ledgerRow(provider: string): HTMLElement {
  const cell = screen.getByRole('cell', { name: provider });
  return cell.closest('tr') as HTMLElement;
}

describe('EconomicsView', () => {
  it('names the provider both headline totals leave out', () => {
    renderEconomicsView();

    const accrued = within(kpiGroup('Accrued')).getByText(/^Excludes Fly\.io/);
    const projected = within(kpiGroup('Projected')).getByText(
      /^Excludes Fly\.io/,
    );
    expect(accrued).toBeInTheDocument();
    expect(projected).toBeInTheDocument();
    // Glanceable in the KPI: the name and the short reason. The sentence that
    // says what to run is an instruction, not a figure, so it belongs beside
    // the provider's own ledger row rather than wrapped across a caption.
    expect(projected).toHaveTextContent('Excludes Fly.io (run-rate only)');
    expect(projected).not.toHaveTextContent('pnpm ops:cost snapshot fly');
    expect(ledgerRow('Fly.io')).toHaveTextContent(
      'pnpm ops:cost snapshot fly <usd>',
    );
  });

  it('names a provider that has no snapshot at all, not only an unpriced one', () => {
    // The default configuration: FLY_COST_MODE is 'manual', so until someone
    // records a figure Fly is missing from both totals with nothing — not even
    // a run-rate — to show for it. Silence here is the original bug relocated.
    const fly = unrecordedFlyProviderFixture();
    renderEconomicsView([...pricedCostProvidersFixture(), fly]);

    for (const label of ['Accrued', 'Projected']) {
      const note = within(kpiGroup(label)).getByText(/^Excludes Fly\.io/);
      expect(note).toHaveTextContent('Excludes Fly.io (nothing recorded)');
    }
    expect(ledgerRow('Fly.io')).toHaveTextContent(fly.message!);
  });

  it('leaves the cash spend total unqualified — no provider is missing', () => {
    renderEconomicsView();
    expect(within(kpiGroup('Cash spend')).queryByText(/Excludes/)).toBeNull();
  });

  it('drops the exclusion note once every provider reports a figure', () => {
    renderEconomicsView(pricedCostProvidersFixture());

    expect(within(kpiBand()).queryByText(/Excludes/)).toBeNull();
    expect(within(kpiGroup('Accrued')).getByText('$26.96')).toBeInTheDocument();
    expect(
      within(kpiGroup('Projected')).getByText('$41.30'),
    ).toBeInTheDocument();
  });

  it('prints the Fly ledger row as a run-rate, not as money owed', () => {
    renderEconomicsView();

    const row = ledgerRow('Fly.io');
    expect(within(row).getByText('Estimated · run-rate')).toBeInTheDocument();
    expect(row).toHaveTextContent('$67.70');
    expect(within(row).getByText('run-rate')).toBeInTheDocument();
    expect(within(row).getAllByText('—')).toHaveLength(2);
  });

  it('reads an operator-recorded Fly figure as a manual estimate', () => {
    renderEconomicsView([
      ...pricedCostProvidersFixture(),
      manualFlyProviderFixture(),
    ]);

    const row = ledgerRow('Fly.io');
    expect(within(row).getByText('Estimated · manual')).toBeInTheDocument();
    expect(row).toHaveTextContent('$14.02');
  });

  // A scraped figure is a real bill Fly stated, so labelling it `run-rate`
  // would resurrect the $67.70-standing-in-for-$14 confusion this vocabulary
  // exists to prevent -- and it is the default a new source falls into.
  it('reads a scraped Fly figure as a dashboard estimate, not a run-rate', () => {
    renderEconomicsView([
      ...pricedCostProvidersFixture(),
      scrapedFlyProviderFixture(),
    ]);

    const row = ledgerRow('Fly.io');
    expect(within(row).getByText('Estimated · dashboard')).toBeInTheDocument();
    expect(within(row).queryByText('Estimated · run-rate')).toBeNull();
    expect(row).toHaveTextContent('$14.02');
  });

  // With a figure recorded, Fly stops being an announced hole in the totals.
  it('drops the Fly exclusion note once a scraped figure lands', () => {
    renderEconomicsView([
      ...pricedCostProvidersFixture(),
      scrapedFlyProviderFixture(),
    ]);

    for (const label of ['Accrued', 'Projected']) {
      expect(
        within(kpiGroup(label)).queryByText(/^Excludes Fly\.io/),
      ).toBeNull();
    }
  });

  it('defines Estimated as a recorded bill, never the run-rate', () => {
    renderEconomicsView();

    const definitions = screen
      .getByRole('heading', { name: 'How costs are calculated' })
      .closest('section') as HTMLElement;
    const estimated = within(definitions)
      .getByText('Estimated')
      .closest('.definition-row') as HTMLElement;
    expect(estimated).toHaveTextContent(
      'A billed amount an operator read off the provider dashboard and recorded',
    );
    expect(estimated).toHaveTextContent(
      'compute run-rate under provider details is a different number',
    );
    expect(estimated).toHaveTextContent('never enters accrued or projected');
  });
});
