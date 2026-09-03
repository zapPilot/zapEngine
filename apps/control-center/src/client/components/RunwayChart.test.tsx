// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { CostHistoryPoint } from '../../shared/types.js';
import {
  costHistoryPointFixture,
  GENERATED_AT,
  manualFlyDayFixture,
  manualFlyProviderFixture,
  pricedCostProvidersFixture,
  unrecordedFlyProviderFixture,
} from '../__fixtures__/dashboard.js';
import { renderRunwayChart } from '../__fixtures__/render.js';

afterEach(cleanup);

/**
 * A day whose split is only priced rows, one per cost, so a test can grow the
 * roster past what the tooltip will print. The provider id repeats because
 * there are four of them and the line cap is about how many rows a day
 * carries, not which providers they are.
 */
function pricedDayFixture(costsUsd: number[]): CostHistoryPoint {
  return costHistoryPointFixture({
    accruedCostUsd: costsUsd.reduce((total, cost) => total + cost, 0),
    providers: costsUsd.map((costUsd, index) => ({
      provider: 'openrouter' as const,
      label: `Provider ${index + 1}`,
      accruedCostUsd: costUsd,
      costType: 'actual' as const,
      source: 'api' as const,
      periodEnd: GENERATED_AT,
    })),
  });
}

function bandBox(label: RegExp): { left: number; width: number } {
  const band = screen.getByLabelText(label);
  return {
    left: Number(band.getAttribute('x')),
    width: Number(band.getAttribute('width')),
  };
}

function rowAmounts(tooltip: HTMLElement): number[] {
  return [...tooltip.querySelectorAll('.runway-tooltip-row strong')].map(
    (cell) => Number(cell.textContent?.replace(/[$,]/g, '')),
  );
}

/**
 * A tooltip exists only while a hit target is active, so every tooltip
 * assertion starts by activating one — with the pointer or, for a keyboard
 * reader, with focus. The target comes back alongside it because closing is
 * asserted on the target rather than on the tooltip.
 */
function activate(
  label: RegExp,
  event: (target: HTMLElement) => void,
): { target: HTMLElement; tooltip: HTMLElement } {
  const target = screen.getByLabelText(label);
  event(target);
  return { target, tooltip: screen.getByRole('tooltip') };
}

describe('RunwayChart', () => {
  it('shows no tooltip until a point is hovered or focused', () => {
    renderRunwayChart();
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('gives every known day and the projection a named hit target', () => {
    renderRunwayChart();
    expect(document.querySelectorAll('.runway-hit')).toHaveLength(4);
    expect(screen.getByLabelText(/^Aug 26 \$32\.10/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Aug 27 \$33\.40/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Aug 28 \$34\.67/)).toBeInTheDocument();
    expect(
      screen.getByLabelText(/^Projected month-end \$35\.70/),
    ).toBeInTheDocument();
  });

  it("breaks a hovered day into each provider's cost and basis", () => {
    renderRunwayChart();
    const { tooltip } = activate(/^Aug 28 /, fireEvent.mouseEnter);

    expect(tooltip).toHaveTextContent('Aug 28');
    expect(tooltip).toHaveTextContent('$34.67');
    expect(within(tooltip).getByText('Supabase')).toBeInTheDocument();
    expect(within(tooltip).getByText('$25.00')).toBeInTheDocument();
    expect(within(tooltip).getByText('Fixed')).toBeInTheDocument();
    expect(within(tooltip).getByText('OpenRouter')).toBeInTheDocument();
    expect(within(tooltip).getByText('$6.12')).toBeInTheDocument();
    expect(within(tooltip).getByText('Actual')).toBeInTheDocument();
    expect(within(tooltip).getByText('DeBank')).toBeInTheDocument();
    expect(
      within(tooltip).getByText('List-price equivalent'),
    ).toBeInTheDocument();
  });

  it('names the unpriced provider on one line instead of dropping it', () => {
    renderRunwayChart();
    const { tooltip } = activate(/^Aug 28 /, fireEvent.mouseEnter);

    expect(within(tooltip).getAllByText(/Excluded/)).toHaveLength(1);
    expect(
      within(tooltip).getByText('Excluded: Fly.io (run-rate only)'),
    ).toBeInTheDocument();
  });

  it('opens the same tooltip on focus and closes it on blur', () => {
    renderRunwayChart();
    const { target, tooltip } = activate(/^Aug 27 /, fireEvent.focus);

    expect(tooltip).toHaveTextContent('$33.40');
    expect(target).toHaveAttribute('aria-describedby', 'runway-tooltip');

    fireEvent.blur(target);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('closes the tooltip on Escape without moving the pointer', () => {
    renderRunwayChart();
    const { target, tooltip } = activate(/^Aug 27 /, fireEvent.focus);

    expect(tooltip).toBeInTheDocument();

    fireEvent.keyDown(target, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('breaks the projection into per-provider projected figures', () => {
    renderRunwayChart();
    const { tooltip } = activate(/^Projected month-end /, fireEvent.mouseEnter);

    expect(tooltip).toHaveTextContent('Projected month-end');
    expect(tooltip).toHaveTextContent('$35.70');
    expect(within(tooltip).getByText('$25.00')).toBeInTheDocument();
    expect(within(tooltip).getByText('$6.80')).toBeInTheDocument();
    expect(within(tooltip).getByText('$3.90')).toBeInTheDocument();
    expect(
      within(tooltip).getByText('Excluded: Fly.io (run-rate only)'),
    ).toBeInTheDocument();
  });

  it('dates an operator-recorded figure so it reads as a floor', () => {
    renderRunwayChart({
      projected: 51.2,
      providers: [...pricedCostProvidersFixture(), manualFlyProviderFixture()],
    });
    const { tooltip } = activate(/^Projected month-end /, fireEvent.mouseEnter);

    expect(within(tooltip).getByText('$15.50')).toBeInTheDocument();
    expect(
      within(tooltip).getByText('Estimated · manual · as of Aug 28'),
    ).toBeInTheDocument();
    expect(within(tooltip).queryByText(/Excluded/)).toBeNull();
  });

  it('dates each day with its own reading, not with the newest one', () => {
    renderRunwayChart({
      history: [
        manualFlyDayFixture({
          date: '2026-08-26',
          readAt: '2026-08-20T09:00:00.000Z',
        }),
        manualFlyDayFixture({
          date: '2026-08-28',
          readAt: '2026-08-27T09:00:00.000Z',
        }),
      ],
    });

    const earlier = activate(/^Aug 26 /, fireEvent.mouseEnter);
    expect(
      within(earlier.tooltip).getByText('Estimated · manual · as of Aug 20'),
    ).toBeInTheDocument();

    fireEvent.mouseLeave(earlier.target);
    const later = activate(/^Aug 28 /, fireEvent.mouseEnter);
    expect(
      within(later.tooltip).getByText('Estimated · manual · as of Aug 27'),
    ).toBeInTheDocument();
  });

  it('names a provider that reported nothing at all in the projection', () => {
    renderRunwayChart({
      providers: [
        ...pricedCostProvidersFixture(),
        unrecordedFlyProviderFixture(),
      ],
    });
    const { tooltip } = activate(/^Projected month-end /, fireEvent.mouseEnter);

    expect(
      within(tooltip).getByText('Excluded: Fly.io (nothing recorded)'),
    ).toBeInTheDocument();
  });

  it('keeps the month-end target reachable on the last day of the month', () => {
    renderRunwayChart({
      history: [
        costHistoryPointFixture({ date: '2026-08-30', accruedCostUsd: 34 }),
        costHistoryPointFixture({ date: '2026-08-31', accruedCostUsd: 35 }),
      ],
    });

    const lastDay = bandBox(/^Aug 31 /);
    const projection = bandBox(/^Projected month-end /);
    // The plot ends at 928 of a 1000-unit viewBox, and the projection owns
    // what is left. Both points sit there on the 31st, so this is the day the
    // midpoint rule alone would have collapsed the projection to nothing.
    expect(projection.width).toBeGreaterThanOrEqual(72);
    expect(lastDay.width).toBeGreaterThan(0);
    expect(projection.left).toBeGreaterThanOrEqual(
      lastDay.left + lastDay.width,
    );

    const { tooltip } = activate(/^Projected month-end /, fireEvent.mouseEnter);
    expect(tooltip).toHaveTextContent('Projected month-end');
  });

  it('sums the providers a long breakdown cannot list, never drops them', () => {
    renderRunwayChart({
      history: [pricedDayFixture([20, 10, 8, 6, 4, 3, 2])],
    });
    const { tooltip } = activate(/^Aug 28 /, fireEvent.mouseEnter);

    const amounts = rowAmounts(tooltip);
    expect(amounts).toHaveLength(6);
    expect(within(tooltip).getByText('2 more providers')).toBeInTheDocument();
    expect(within(tooltip).getByText('$5.00')).toBeInTheDocument();
    // The header total is the reason the residual line exists at all.
    expect(amounts.reduce((total, amount) => total + amount, 0)).toBe(53);
    expect(tooltip).toHaveTextContent('$53.00');
  });

  it('waits for a priced day rather than drawing an empty plot', () => {
    renderRunwayChart({
      history: [costHistoryPointFixture({ accruedCostUsd: null })],
    });
    expect(
      screen.getByText(
        'Daily snapshots will appear after the first cost sync.',
      ),
    ).toBeVisible();
    expect(document.querySelectorAll('.runway-hit')).toHaveLength(0);
  });
});
