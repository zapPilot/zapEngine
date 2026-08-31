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

      <RunwayChart
        history={history?.currentMonthDaily ?? []}
        projected={data?.projectedCostUsd}
      />

      <ProviderCostDrivers providers={data?.providers ?? []} />

      <PodcastUnitEconomics data={podcastCosts} />

      <CostHistoryChart points={history?.monthlyTotals ?? []} />

      <details className="panel decision-disclosure">
        <summary className="decision-disclosure-summary">
          <span>
            <strong>Provider cost audit</strong>
            <small>
              Full ledger, usage counters, and accounting definitions
            </small>
          </span>
        </summary>
        <div className="decision-disclosure-body">
          <section className="disclosure-section">
            <div className="panel-head">
              <h2>Provider ledger</h2>
              <small className="panel-note">
                One row per provider the cost sync knows how to read
              </small>
            </div>
            <ProviderLedger detailed providers={data?.providers ?? []} />
          </section>

          <section className="disclosure-section">
            <div className="panel-head">
              <h2>Provider details</h2>
            </div>
            <UsageSignals providers={data?.providers ?? []} />
          </section>

          <section className="disclosure-section">
            <div className="panel-head">
              <h2>How costs are calculated</h2>
              <small className="panel-note">
                Reference only — these definitions should not compete with the
                spend decision
              </small>
            </div>
            <div className="definition-list">
              <Definition term="Actual">
                Provider-reported usage cost.
              </Definition>
              <Definition term="Fixed">
                Committed recurring monthly cost.
              </Definition>
              <Definition term="List-price equivalent">
                Prepaid units valued using the rate active when the snapshot was
                stored.
              </Definition>
              <Definition term="Cash spend">
                Charges, top-ups, subscriptions, and invoices recorded
                separately from operating usage.
              </Definition>
            </div>
          </section>
        </div>
      </details>
    </div>
  );
}

function ProviderCostDrivers({
  providers,
}: {
  providers: OverviewResponse['providers'];
}) {
  const costed = providers
    .flatMap((provider) => {
      const cost = provider.snapshot?.accruedCostUsd;
      return cost === null || cost === undefined
        ? []
        : [{ cost, label: provider.label, status: provider.status }];
    })
    .sort((left, right) => right.cost - left.cost);
  const max = costed[0]?.cost ?? 0;

  return (
    <section className="panel cost-drivers">
      <div className="panel-head">
        <h2>Where the money is going</h2>
        <small className="panel-note">
          Current accrued provider cost; open the audit only when you need the
          accounting basis
        </small>
      </div>
      {costed.length === 0 ? (
        <div className="empty-inline">No provider cost snapshots yet.</div>
      ) : (
        <div className="cost-driver-list">
          {costed.slice(0, 6).map((provider) => (
            <div className="cost-driver-row" key={provider.label}>
              <span>
                <strong>{provider.label}</strong>
                {provider.status !== 'ok' ? (
                  <small className="warning-text">Needs attention</small>
                ) : null}
              </span>
              <span className="cost-driver-track" aria-hidden="true">
                <i
                  style={{
                    width: `${max > 0 ? Math.max(2, (provider.cost / max) * 100) : 0}%`,
                  }}
                />
              </span>
              <strong className="mono">{usd(provider.cost)}</strong>
            </div>
          ))}
        </div>
      )}
    </section>
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
