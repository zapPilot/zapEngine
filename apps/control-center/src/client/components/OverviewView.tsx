import type { OverviewResponse, SocialDecision } from '../../shared/types.js';
import { integer, percent, usd } from '../format.js';
import { platformLabel } from '../platform.js';
import { ProviderLedger } from './ProviderLedger.js';

export function OverviewView({ data }: { data: OverviewResponse | null }) {
  const product = data?.product;
  return (
    <div className="view-stack">
      <section className="metric-strip" aria-label="Operating overview">
        <Metric
          accent="projected"
          label="Projected month-end spend"
          value={usd(data?.projectedCostUsd)}
        />
        <Metric
          accent="actual"
          label="Observed portfolio value"
          value={usd(product?.observedPortfolioUsd)}
        />
        <Metric label="Weekly active users" value={integer(product?.wau)} />
        <Metric label="Monthly active users" value={integer(product?.mau)} />
        <Metric
          label="Registered users"
          value={integer(product?.registeredUsers)}
        />
        <Metric
          label="Tracked social followers"
          value={integer(data?.socialReach)}
        />
      </section>

      <div className="overview-lower">
        <section className="open-panel provider-panel">
          <div className="section-heading">
            <h2>Provider ledger</h2>
          </div>
          <ProviderLedger providers={data?.providers ?? []} />
        </section>

        <section className="open-panel product-health-panel">
          <div className="section-heading">
            <h2>Product health</h2>
          </div>
          <div className="decision-list">
            <DecisionRow
              label="Activation funnel"
              value={`${integer(product?.registeredUsers)} registered → ${integer(product?.verifiedWallets)} verified → ${integer(product?.portfolioUsers)} observed`}
            />
            <DecisionRow
              label="Engagement"
              value={`${integer(product?.wau)} WAU / ${integer(product?.mau)} MAU`}
            />
            <DecisionRow
              label="Portfolio freshness"
              value={`${integer(product?.portfolioFresh24h)} fresh <24h · ${integer(product?.portfolioFresh7d)} fresh <7d`}
            />
            <DecisionRow
              label="Concentration"
              value={`Top 1 ${percent(product?.top1PortfolioShare)} · Top 3 ${percent(product?.top3PortfolioShare)}`}
            />
          </div>
        </section>

        <section className="open-panel social-pulse">
          <div className="section-heading">
            <h2>What to publish next</h2>
          </div>
          <div className="decision-list">
            {(data?.social.decisions ?? []).slice(0, 4).map((decision) => (
              <SocialDecisionRow decision={decision} key={decision.platform} />
            ))}
            {data?.social.decisions.length === 0 ? (
              <div className="empty-inline">
                No learned social strategy yet.
              </div>
            ) : null}
          </div>
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

function DecisionRow(props: { label: string; value: string }) {
  return (
    <div className="decision-row">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}

function SocialDecisionRow({ decision }: { decision: SocialDecision }) {
  const hooks = decision.preferredHookTypes.length
    ? decision.preferredHookTypes.join(' / ')
    : 'Keep exploring';
  const evidence = `${decision.evidenceSamples} samples · ${decision.confidence} confidence`;
  return (
    <div className="decision-row social-decision-row">
      <span>
        {platformLabel(decision.platform)} · {evidence}
      </span>
      <strong>{hooks}</strong>
      <small>
        {[decision.bestTimeWindow, decision.bestTopic]
          .filter(Boolean)
          .join(' · ') || 'More samples needed for timing/topic'}
      </small>
    </div>
  );
}
