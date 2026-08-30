import type {
  CostHistoryResponse,
  OverviewResponse,
  PodcastCostResponse,
} from '../../shared/types.js';
import { usd } from '../format.js';
import { CostHistoryChart } from './CostHistoryChart.js';
import { KpiGroup } from './KpiGroup.js';
import { PodcastUnitEconomics } from './PodcastUnitEconomics.js';
import { ProviderLedger, UsageSignals } from './ProviderLedger.js';
import { RunwayChart } from './RunwayChart.js';

export function EconomicsView({
  data,
  history,
  podcastCosts,
}: {
  data: OverviewResponse | null;
  history: CostHistoryResponse | null;
  podcastCosts: PodcastCostResponse | null;
}) {
  return (
    <div className="view-stack">
      <section aria-label="Operating cost" className="kpi-band kpi-band-three">
        <KpiGroup
          caption="Month-to-date operating cost"
          label="Accrued"
          tone="accent"
          value={usd(data?.accruedCostUsd)}
        />
        <KpiGroup
          caption="Projected month-end"
          label="Projected"
          tone="warning"
          value={usd(data?.projectedCostUsd)}
        />
        <KpiGroup
          caption="Charges, top-ups and invoices this month"
          label="Cash spend"
          value={usd(data?.cashInvoiceSpendUsd)}
        />
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Cost semantics</h2>
          <small className="panel-note">
            What each number in the ledger below is actually claiming
          </small>
        </div>
        <div className="definition-list">
          <Definition term="Actual">Provider-reported usage cost.</Definition>
          <Definition term="Fixed">
            Committed recurring monthly cost.
          </Definition>
          <Definition term="List-price equivalent">
            Prepaid units valued using the rate active when the snapshot was
            stored.
          </Definition>
          <Definition term="Cash spend">
            Charges, top-ups, subscriptions, and invoices recorded separately
            from operating usage.
          </Definition>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Provider ledger</h2>
          <small className="panel-note">
            One row per provider the cost sync knows how to read
          </small>
        </div>
        <ProviderLedger detailed providers={data?.providers ?? []} />
      </section>

      <PodcastUnitEconomics data={podcastCosts} />

      <div className="economics-lower">
        <section className="panel">
          <div className="panel-head">
            <h2>Provider details</h2>
          </div>
          <UsageSignals providers={data?.providers ?? []} />
        </section>
        <RunwayChart
          history={history?.currentMonthDaily ?? []}
          projected={data?.projectedCostUsd}
        />
      </div>

      <CostHistoryChart points={history?.monthlyTotals ?? []} />
    </div>
  );
}

function Definition(props: { children: string; term: string }) {
  return (
    <div className="definition-row">
      <span
        className={`definition-dot ${props.term.toLowerCase().replaceAll(' ', '-')}`}
      />
      <strong>{props.term}</strong>
      <p>{props.children}</p>
    </div>
  );
}
