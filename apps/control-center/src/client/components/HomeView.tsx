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

const QUEUE_PREVIEW = 3;

/**
 * The founder's first screen is deliberately sparse. It answers three things
 * before exposing evidence: is something wrong, what should happen first, and
 * are the business headlines moving. Qualifiers stay behind one disclosure;
 * full evidence still belongs to the domain views.
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
      <StatusBanner compact data={operations} />

      <section className="panel queue-panel">
        <div className="panel-head">
          <h2>Do this first</h2>
          <small className="panel-note">
            {operations
              ? `${integer(operations.priorities.length)} ranked decisions`
              : 'Waiting for operational signals'}
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

      <section
        aria-label="Business headlines"
        className="kpi-band kpi-band-three"
      >
        <KpiGroup
          caption="Observed portfolio value"
          label="Product"
          tone="accent"
          value={usdWhole(product?.observedPortfolioUsd)}
        />
        <KpiGroup
          caption="Tracked social followers"
          label="Growth"
          value={integer(data?.socialReach)}
        />
        <KpiGroup
          caption="Projected month-end spend"
          label="Spend"
          tone="warning"
          value={usdWhole(data?.projectedCostUsd)}
        />
      </section>

      <details className="panel home-disclosure">
        <summary className="home-disclosure-summary">
          <strong>More context</strong>
          <span>Product, growth and spend qualifiers</span>
        </summary>
        <div className="home-context-grid">
          <section className="home-context-section">
            <h3>Product</h3>
            <div className="info-list">
              <InfoRow
                label="Activity"
                notes={[
                  `${integer(product?.registeredUsers)} registered users`,
                ]}
                value={`${integer(product?.wau)} WAU · ${integer(product?.mau)} MAU`}
              />
              <InfoRow
                label="Activation"
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
                Full Product view
              </button>
            </div>
          </section>

          <section className="home-context-section">
            <h3>Growth</h3>
            <div className="info-list">
              <InfoRow
                label="Coverage"
                notes={[
                  `${integer(data?.social.episodes[0]?.totalViews)} views on the latest episode`,
                ]}
                value={`${integer(data?.social.accounts.length)} telemetry channels`}
              />
              {(data?.social.decisions ?? []).slice(0, 2).map((decision) => (
                <PublishRow decision={decision} key={decision.platform} />
              ))}
              {data && data.social.decisions.length === 0 ? (
                <div className="empty-inline">No publishing evidence yet.</div>
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
                Full Growth view
              </button>
            </div>
          </section>

          <section className="home-context-section">
            <h3>Spend</h3>
            <div className="info-list">
              <InfoRow
                label="Month to date"
                notes={['Usage-equivalent operating cost']}
                value={usd(data?.accruedCostUsd)}
              />
              <InfoRow
                label="Cash spend"
                notes={['Invoices, top-ups and subscriptions']}
                value={usd(data?.cashInvoiceSpendUsd)}
              />
            </div>
            <div className="panel-foot">
              <button
                className="panel-link"
                onClick={() => props.onNavigate('economics')}
                type="button"
              >
                Full Economics view
              </button>
            </div>
          </section>
        </div>
      </details>
    </div>
  );
}

function PublishRow({ decision }: { decision: SocialDecision }) {
  return (
    <InfoRow
      label={`${platformLabel(decision.platform)} · ${integer(decision.evidenceSamples)} 24h samples`}
      notes={[publishEvidenceNote(decision)]}
      value={
        decision.bestTopic
          ? `Prioritize ${decision.bestTopic}`
          : 'Keep exploring topics'
      }
    />
  );
}

function publishEvidenceNote(decision: SocialDecision): string {
  if (
    decision.bestTopic &&
    decision.bestTopicMedian24hViews !== null &&
    decision.bestTopicLiftVsPlatformMedian !== null
  ) {
    return `${integer(decision.bestTopicMedian24hViews)} median views · ${decision.bestTopicLiftVsPlatformMedian.toLocaleString('en-US', { maximumFractionDigits: 2 })}× platform median · ${decision.confidence} sample coverage`;
  }
  return `Not enough qualified topic buckets yet · ${decision.confidence} sample coverage`;
}
