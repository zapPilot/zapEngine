import type {
  StatementDomain,
  StatementsResponse,
} from '../../shared/statements.js';
import type {
  OperationsResponse,
  OverviewResponse,
} from '../../shared/types.js';
import { integer, usdWhole } from '../format.js';
import type { DashboardView } from './AppShell.js';
import { MetricCell } from './MetricCell.js';
import { PriorityQueue } from './PriorityQueue.js';
import { Statement } from './Statement.js';
import { renderSentence } from './statement-sentence.js';

const FULL_VIEW: Record<StatementDomain, DashboardView> = {
  reliability: 'reliability',
  product: 'product',
  pipeline: 'pipeline',
  spend: 'economics',
  growth: 'growth',
};
const VIEW_LABEL: Record<StatementDomain, string> = {
  reliability: 'Reliability',
  product: 'Product',
  pipeline: 'Pipeline',
  spend: 'Economics',
  growth: 'Growth',
};

/**
 * The founder's first screen: one sentence states the conclusion, five
 * statements sorted by priority prove it, and the north-star band shows
 * value · reach · burn. Nothing here expands by default and nothing raw
 * (no table, no fingerprint) sits at this level — see handoff.md §1 and §4.
 */
export function HomeView(props: {
  data: OverviewResponse | null;
  onNavigate: (view: DashboardView) => void;
  operations: OperationsResponse | null;
  statements: StatementsResponse | null;
}) {
  const { data, operations, statements } = props;
  const product = data?.product;
  const verdict = statements?.headers.find(
    (header) => header.domain === 'reliability',
  );
  const northStar = statements?.statements.find(
    (statement) => statement.domain === 'product',
  );
  const audience = statements?.statements.find(
    (statement) => statement.domain === 'growth',
  );
  const spend = statements?.statements.find(
    (statement) => statement.domain === 'spend',
  );

  return (
    <div className="view-stack">
      {verdict ? (
        <p className={`home-verdict ${verdict.status}`}>
          {renderSentence(verdict.sentence)}
        </p>
      ) : null}

      <section className="panel">
        <div className="panel-head">
          <h2>Read this first</h2>
          <small className="panel-note">
            Sorted by priority score · 30-day trend on the right
          </small>
        </div>
        {statements && statements.statements.length > 0 ? (
          statements.statements.map((statement) => (
            <Statement
              deltaTone={statement.deltaTone}
              delta={statement.delta}
              evidence={
                <StatementEvidence
                  domain={statement.domain}
                  onNavigate={props.onNavigate}
                  operations={operations}
                  statements={statements}
                />
              }
              key={statement.domain}
              kicker={statement.kicker}
              sentence={statement.sentence}
              series={statement.series}
              status={statement.status}
              value={statement.value}
            />
          ))
        ) : (
          <div className="empty-inline">Waiting for data.</div>
        )}
      </section>

      <section aria-label="How we are doing" className="kpi-band">
        <MetricCell
          caption="Users active 7d whose portfolio also refreshed in 7d"
          delta={northStar?.delta ?? '—'}
          deltaTone={northStar?.deltaTone ?? 'neutral'}
          label="Active portfolios"
          series={northStar?.series ?? []}
          tone="accent"
          value={integer(product?.activePortfolios7d)}
        />
        <MetricCell
          caption="Context, not a growth metric — tracks BTC and one customer"
          delta="context"
          deltaTone="neutral"
          label="Observed AUM"
          series={[]}
          value={usdWhole(product?.observedPortfolioUsd)}
        />
        <MetricCell
          caption="Tracked social followers"
          delta={audience?.delta ?? '—'}
          deltaTone={audience?.deltaTone ?? 'neutral'}
          label="Audience"
          series={audience?.series ?? []}
          value={integer(data?.socialReach)}
        />
        <MetricCell
          caption="Projected month-end operating cost"
          delta={spend?.delta ?? '—'}
          deltaTone={spend?.deltaTone ?? 'neutral'}
          label="Month-end spend"
          series={spend?.series ?? []}
          value={usdWhole(data?.projectedCostUsd)}
        />
      </section>
    </div>
  );
}

function StatementEvidence(props: {
  domain: StatementDomain;
  onNavigate: (view: DashboardView) => void;
  operations: OperationsResponse | null;
  statements: StatementsResponse;
}) {
  const header = props.statements.headers.find(
    (h) => h.domain === props.domain,
  );
  return (
    <div className="evidence-stack">
      {header && header.facts.length > 0 ? (
        <div className="statement-header-facts">
          {header.facts.map((fact, index) => (
            <div key={`${fact.kicker}-${index}`} className="statement-header-fact">
              <span>{fact.kicker}</span>
              <strong>{fact.value}</strong>
              <small>{fact.note}</small>
            </div>
          ))}
        </div>
      ) : null}
      {props.domain === 'reliability' ? (
        <PriorityQueue
          emptyMessage="Nothing above the action threshold."
          limit={3}
          priorities={props.operations?.priorities}
        />
      ) : null}
      <button
        className="panel-link"
        onClick={() => props.onNavigate(FULL_VIEW[props.domain])}
        type="button"
      >
        Full {VIEW_LABEL[props.domain]} view
      </button>
    </div>
  );
}
