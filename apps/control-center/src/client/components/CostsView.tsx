import type {
  CostHistoryResponse,
  OverviewResponse,
} from '../../shared/types.js';
import { usd } from '../format.js';
import { CostHistoryChart } from './CostHistoryChart.js';
import { ProviderLedger, UsageSignals } from './ProviderLedger.js';
import { RunwayChart } from './RunwayChart.js';

export function CostsView({
  data,
  history,
}: {
  data: OverviewResponse | null;
  history: CostHistoryResponse | null;
}) {
  return (
    <div className="view-stack costs-view">
      <div className="costs-intro">
        <section className="cost-hero actual-border">
          <strong className="mono actual">{usd(data?.accruedCostUsd)}</strong>
          <span>Month-to-date operating cost</span>
        </section>
        <section className="cost-hero projected-border">
          <strong className="mono projected">
            {usd(data?.projectedCostUsd)}
          </strong>
          <span>Projected month-end</span>
        </section>
        <section className="cost-hero">
          <strong className="mono">{usd(data?.cashInvoiceSpendUsd)}</strong>
          <span>Cash spend this month</span>
        </section>
      </div>

      <section className="semantics-panel">
        <h2>Cost semantics</h2>
        <Definition term="Actual">Provider-reported usage cost.</Definition>
        <Definition term="Fixed">Committed recurring monthly cost.</Definition>
        <Definition term="List-price equivalent">
          Prepaid units valued using the rate active when the snapshot was
          stored.
        </Definition>
        <Definition term="Cash spend">
          Charges, top-ups, subscriptions, and invoices recorded separately from
          operating usage.
        </Definition>
      </section>

      <section className="open-panel costs-ledger">
        <div className="section-heading">
          <h2>Provider ledger</h2>
        </div>
        <ProviderLedger detailed providers={data?.providers ?? []} />
      </section>

      <div className="costs-lower">
        <section className="open-panel provider-details">
          <div className="section-heading">
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
