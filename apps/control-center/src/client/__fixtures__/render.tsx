import { render } from '@testing-library/react';

import type { CostProviderResult } from '../../shared/types.js';
import { EconomicsView } from '../components/EconomicsView.js';
import { RunwayChart } from '../components/RunwayChart.js';
import {
  costHistoryFixture,
  costProvidersFixture,
  overviewFixture,
} from './dashboard.js';

/**
 * Exactly the three priced providers' projections — 25 + 6.80 + 3.90 — and
 * nothing for Fly. That is what the app itself totals when a provider reports
 * no amount, and it is what makes the exclusion note checkable: the lines a
 * reader sees add up to the headline, and the missing provider is named rather
 * than left as an unexplained gap. A recorded Fly figure adds 15.50 on top,
 * which is where the 51.20 in the manual-estimate test comes from.
 */
const PROJECTED_TOTAL_USD = 35.7;

/**
 * The chart against the roster the cost sync returns today, so a test that is
 * about one day or one provider does not restate the whole month. Economics
 * embeds this chart and both are asserted against the same fixtures, which is
 * why the two harnesses live together rather than beside their own specs.
 */
export function renderRunwayChart(
  overrides: Partial<Parameters<typeof RunwayChart>[0]> = {},
): void {
  render(
    <RunwayChart
      history={costHistoryFixture().currentMonthDaily}
      projected={PROJECTED_TOTAL_USD}
      providers={costProvidersFixture()}
      {...overrides}
    />,
  );
}

/**
 * Economics takes only a provider roster because the roster is the whole
 * input to what its cost basis, its exclusions and its ledger say. Production
 * costs and the founder statement stay absent on purpose: a page that needed
 * either of them present to report spend honestly would itself be the bug.
 */
export function renderEconomicsView(
  providers: CostProviderResult[] = costProvidersFixture(),
): void {
  render(
    <EconomicsView
      data={overviewFixture({ providers })}
      history={costHistoryFixture()}
      podcastCosts={null}
      statements={null}
    />,
  );
}
