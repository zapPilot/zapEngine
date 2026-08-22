import type { OverviewResponse } from '../../shared/types.js';
import { usd } from '../format.js';
import { ProviderLedger, UsageSignals } from './ProviderLedger.js';
import { RunwayChart } from './RunwayChart.js';

export function CostsView({ data }: { data: OverviewResponse | null }) {
  return (
    <div className="view-stack costs-view">
      <div className="costs-intro">
        <section className="cost-hero actual-border">
          <strong className="mono actual">{usd(data?.accruedCostUsd)}</strong>
          <span>Accrued usage cost</span>
        </section>
        <section className="cost-hero projected-border">
          <strong className="mono projected">
            {usd(data?.projectedCostUsd)}
          </strong>
          <span>Projected month-end</span>
        </section>
        <section className="semantics-panel">
          <h2>Understanding cost semantics</h2>
          <Definition term="Actual">
            Provider-reported billing or usage data accrued this month.
          </Definition>
          <Definition term="Estimated">
            Current usage translated through a versioned pricing model.
          </Definition>
          <Definition term="List-price equivalent">
            Observed prepaid units valued at configured list price.
          </Definition>
        </section>
      </div>

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
          accrued={data?.accruedCostUsd}
          generatedAt={data?.generatedAt}
          projected={data?.projectedCostUsd}
        />
      </div>
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
