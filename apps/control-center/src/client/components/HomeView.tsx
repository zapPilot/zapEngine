import type {
  OperationsResponse,
  OverviewResponse,
  SocialDecision,
} from '../../shared/types.js';
import { integer, percent, usd, usdWhole } from '../format.js';
import { platformLabel } from '../platform.js';
import type { DashboardView } from './AppShell.js';
import { InfoRow } from './InfoRow.js';
import { KpiGroup } from './KpiGroup.js';
import { PriorityQueue } from './PriorityQueue.js';
import { StatusBanner } from './Status.js';

const QUEUE_PREVIEW = 6;

/**
 * The founder's first screen. Order is the whole design: what is wrong, what to
 * do about it, then the numbers that say whether the business is working.
 * Evidence tables live in the four domain views — putting a provider ledger
 * here is what buried the action list last time.
 */
export function HomeView(props: {
  data: OverviewResponse | null;
  onNavigate: (view: DashboardView) => void;
  operations: OperationsResponse | null;
}) {
  const { data, operations } = props;
  const product = data?.product;
  const overflow = Math.max(
    (operations?.priorities.length ?? 0) - QUEUE_PREVIEW,
    0,
  );

  return (
    <div className="view-stack">
      <StatusBanner data={operations} />

      <section className="panel queue-panel">
        <div className="panel-head">
          <h2>Do this first</h2>
          <small className="panel-note">
            Ranked by status, blast radius and evidence — not by recency
          </small>
        </div>
        <PriorityQueue
          emptyMessage="All clear. Nothing is above the action threshold."
          limit={QUEUE_PREVIEW}
          priorities={operations?.priorities}
        />
        {overflow > 0 ? (
          <div className="panel-foot">
            <button
              className="panel-link"
              onClick={() => props.onNavigate('reliability')}
              type="button"
            >
              {integer(overflow)} more in Reliability
            </button>
          </div>
        ) : null}
      </section>

      <section aria-label="Business vital signs" className="kpi-band">
        <KpiGroup
          caption="Observed portfolio value"
          label="Product"
          secondary={[
            `${integer(product?.wau)} WAU`,
            `${integer(product?.mau)} MAU`,
            `${integer(product?.registeredUsers)} registered`,
          ]}
          tone="accent"
          value={usdWhole(product?.observedPortfolioUsd)}
        />
        <KpiGroup
          caption="Tracked social followers"
          label="Growth"
          secondary={[
            `${integer(data?.social.accounts.length)} telemetry channels`,
            `${integer(data?.social.episodes[0]?.totalViews)} views on the latest episode`,
          ]}
          value={integer(data?.socialReach)}
        />
        <KpiGroup
          caption="Projected month-end spend"
          label="Spend"
          secondary={[
            `Month to date ${usd(data?.accruedCostUsd)}`,
            `Cash spend ${usd(data?.cashInvoiceSpendUsd)}`,
          ]}
          tone="warning"
          value={usdWhole(data?.projectedCostUsd)}
        />
        <KpiGroup
          caption="Domains reporting healthy"
          label="Reliability"
          secondary={[
            `${integer(operations?.priorities.length)} need a decision`,
            `${integer(operations?.signals.length)} signals collected`,
          ]}
          value={healthyDomains(operations)}
        />
      </section>

      <div className="home-lower">
        <section className="panel">
          <div className="panel-head">
            <h2>What to publish next</h2>
            <small className="panel-note">
              Learned once per episode, shared by every platform
            </small>
          </div>
          <div className="info-list">
            {(data?.social.decisions ?? []).slice(0, 2).map((decision) => (
              <PublishRow decision={decision} key={decision.platform} />
            ))}
            {data && data.social.decisions.length === 0 ? (
              <div className="empty-inline">
                No learned social strategy yet.
              </div>
            ) : null}
            {data ? null : (
              <div className="empty-inline">Waiting for data.</div>
            )}
          </div>
          <div className="panel-foot">
            <button
              className="panel-link"
              onClick={() => props.onNavigate('growth')}
              type="button"
            >
              Per-platform evidence in Growth
            </button>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>Product health</h2>
            <small className="panel-note">
              Observed coverage, not authoritative AUM
            </small>
          </div>
          <div className="info-list">
            <InfoRow
              label="Activation funnel"
              notes={[
                `Top 1 holds ${percent(product?.top1PortfolioShare)} of observed value`,
              ]}
              value={`${integer(product?.registeredUsers)} registered → ${integer(product?.verifiedWallets)} verified → ${integer(product?.portfolioUsers)} observed`}
            />
            <InfoRow
              label="Portfolio freshness"
              notes={[
                'Stale portfolios make every other product number older than it looks',
              ]}
              value={`${integer(product?.portfolioFresh24h)} fresh <24h · ${integer(product?.portfolioFresh7d)} fresh <7d`}
            />
          </div>
          <div className="panel-foot">
            <button
              className="panel-link"
              onClick={() => props.onNavigate('product')}
              type="button"
            >
              Per-customer detail in Product
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

function PublishRow({ decision }: { decision: SocialDecision }) {
  return (
    <InfoRow
      label={`${platformLabel(decision.platform)} · ${decision.confidence} confidence`}
      notes={[
        decision.bestTopic
          ? `Top topic: ${decision.bestTopic} (median of ${integer(decision.bestTopicSamples)} posts)`
          : 'Not enough topic evidence yet',
      ]}
      value={
        decision.preferredHookTypes.length
          ? decision.preferredHookTypes.join(' / ')
          : 'Keep exploring'
      }
    />
  );
}

function healthyDomains(data: OperationsResponse | null): string {
  if (!data) {
    return '—';
  }
  const healthy = data.domains.filter(
    (domain) => domain.status === 'healthy',
  ).length;
  return `${healthy}/${data.domains.length}`;
}
