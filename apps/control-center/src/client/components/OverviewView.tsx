import type { OverviewResponse } from '../../shared/types.js';
import { integer, usd } from '../format.js';
import { ProviderLedger, UsageSignals } from './ProviderLedger.js';
import { RunwayChart } from './RunwayChart.js';

export function OverviewView({ data }: { data: OverviewResponse | null }) {
  const latestEpisode = data?.social.episodes[0];
  return (
    <div className="view-stack">
      <section className="metric-strip" aria-label="Operating overview">
        <Metric
          accent="actual"
          label="Accrued usage cost"
          value={usd(data?.accruedCostUsd)}
        />
        <Metric
          accent="projected"
          label="Projected month-end"
          value={usd(data?.projectedCostUsd)}
        />
        <Metric
          label="Cash / invoice spend"
          value={usd(data?.cashInvoiceSpendUsd)}
        />
        <Metric label="AUM" value={usd(data?.aumUsd)} />
        <Metric label="Active accounts" value={integer(data?.activeAccounts)} />
        <Metric label="Social reach" value={integer(data?.socialReach)} />
      </section>

      <RunwayChart
        accrued={data?.accruedCostUsd}
        generatedAt={data?.generatedAt}
        projected={data?.projectedCostUsd}
      />

      <div className="overview-lower">
        <section className="open-panel provider-panel">
          <div className="section-heading">
            <h2>Provider ledger</h2>
          </div>
          <ProviderLedger providers={data?.providers ?? []} />
        </section>
        <section className="open-panel usage-panel">
          <div className="section-heading">
            <h2>Usage signals</h2>
          </div>
          <UsageSignals providers={data?.providers ?? []} />
        </section>
        <section className="open-panel social-pulse">
          <div className="section-heading">
            <h2>Social pulse</h2>
          </div>
          <div className="account-list">
            {(data?.social.accounts ?? []).map((account) => (
              <div className="account-row" key={account.platform}>
                <span className="platform-label">
                  {platformLabel(account.platform)}
                </span>
                <strong className="mono">{integer(account.followers)}</strong>
                <small>followers</small>
              </div>
            ))}
          </div>
          {latestEpisode ? (
            <div className="latest-episode">
              <span>Latest episode performance</span>
              <strong>{latestEpisode.title}</strong>
              <div className="episode-totals">
                <span>
                  <b className="mono">{integer(latestEpisode.totalViews)}</b>{' '}
                  views
                </span>
                <span>
                  <b className="mono">
                    {integer(latestEpisode.totalImpressions)}
                  </b>{' '}
                  impressions
                </span>
              </div>
            </div>
          ) : (
            <div className="empty-inline">
              {data?.social.message ?? 'No social snapshots yet.'}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Metric(props: {
  accent?: 'actual' | 'projected';
  label: string;
  value: string;
}) {
  return (
    <div className="headline-metric">
      <span>{props.label}</span>
      <strong className={`mono ${props.accent ?? ''}`}>{props.value}</strong>
    </div>
  );
}

function platformLabel(platform: string): string {
  const labels: Record<string, string> = {
    x: 'X',
    rednote: 'Rednote',
    youtube: 'YouTube',
    threads: 'Threads',
  };
  return labels[platform] ?? platform;
}
