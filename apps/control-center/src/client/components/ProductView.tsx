import { type ReactNode, useState } from 'react';

import type {
  CustomerEconomicsResponse,
  CustomerRecord,
  ProductHealthResponse,
} from '../../shared/types.js';
import {
  daysAgo,
  hoursAgo,
  integer,
  percent,
  relativeTime,
  usd,
} from '../format.js';
import { InfoRow } from './InfoRow.js';
import { Metric } from './Metric.js';

export function ProductView(props: {
  customers: CustomerEconomicsResponse | null;
  product: ProductHealthResponse | undefined;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const data = props.customers;
  const summary = data?.summary;
  const product = props.product;

  return (
    <div className="view-stack">
      <section aria-label="Customer economics" className="metric-strip">
        <Metric label="Customers" value={integer(summary?.totalCustomers)} />
        <Metric label="Priority" value={integer(summary?.priorityUsers)} />
        <Metric label="Standard" value={integer(summary?.standardUsers)} />
        <Metric
          label="Priority but inactive 30d+"
          tone="warning"
          value={integer(summary?.inactiveButPriority)}
        />
        <Metric
          label="AUM under service"
          tone="accent"
          value={usd(summary?.aumUsd)}
        />
        <Metric
          label="30d provider cost (est.)"
          value={usd(summary?.attributedCostUsd30d)}
        />
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Product health</h2>
          <small className="panel-note">
            Coverage and freshness are part of the decision, so the portfolio
            figure is labelled observed rather than authoritative AUM
          </small>
        </div>
        <div className="info-list">
          <InfoRow
            label="Activation funnel"
            value={`${integer(product?.registeredUsers)} registered → ${integer(product?.verifiedWallets)} verified → ${integer(product?.portfolioUsers)} observed`}
          />
          <InfoRow
            label="Engagement"
            value={`${integer(product?.wau)} WAU / ${integer(product?.mau)} MAU`}
          />
          <InfoRow
            label="Portfolio freshness"
            value={`${integer(product?.portfolioFresh24h)} fresh <24h · ${integer(product?.portfolioFresh7d)} fresh <7d`}
          />
          <InfoRow
            label="Concentration"
            notes={[
              `${usd(product?.observedPortfolioUsd)} observed across every tracked wallet`,
            ]}
            value={`Top 1 ${percent(product?.top1PortfolioShare)} · Top 3 ${percent(product?.top3PortfolioShare)}`}
          />
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Who we serve</h2>
          <small className="panel-note">
            Cost is DeBank&apos;s account invoice split by request volume — an
            allocation, not a measurement. Revenue is unknown because nothing in
            this system bills anyone.
          </small>
        </div>
        <div className="table-wrap">
          <table className="data-table customers-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Plan</th>
                <th>Service</th>
                <th>Last active†</th>
                <th>Refresh</th>
                <th>AUM</th>
                <th>30d cost (est.)</th>
                <th>Revenue</th>
              </tr>
            </thead>
            <tbody>
              {(data?.users ?? []).map((user) => (
                <CustomerRows
                  expanded={expanded === user.userId}
                  key={user.userId}
                  onToggle={() =>
                    setExpanded(expanded === user.userId ? null : user.userId)
                  }
                  user={user}
                />
              ))}
            </tbody>
          </table>
          {data && data.users.length === 0 ? (
            <div className="empty-inline">
              {data.message ?? 'No customers returned.'}
            </div>
          ) : null}
          {data ? null : <div className="empty-inline">Waiting for data.</div>}
        </div>
        <small className="table-footnote">
          † account-engine route activity (dashboard visits), debounced hourly.
          It is not whole-product usage.
        </small>
      </section>
    </div>
  );
}

function CustomerRows(props: {
  expanded: boolean;
  onToggle: () => void;
  user: CustomerRecord;
}) {
  const { user } = props;
  return (
    <>
      <tr
        aria-expanded={props.expanded}
        className={props.expanded ? 'customer-row open' : 'customer-row'}
        onClick={props.onToggle}
      >
        <td>
          <span className="cell-title">{user.email ?? user.userId}</span>
          <small className="cell-fingerprint">
            {integer(user.wallets.length)} wallet
            {user.wallets.length === 1 ? '' : 's'}
          </small>
        </td>
        <td>{user.planCode}</td>
        <td>
          <span className={`tier-pill ${user.effectiveTier}`}>
            {user.effectiveTier}
          </span>
          {user.overrideTier ? <small> override</small> : null}
        </td>
        <td className="cell-nowrap">{daysAgo(user.inactiveDays)}</td>
        <td className="cell-nowrap">
          {user.refreshIntervalHours
            ? `every ${user.refreshIntervalHours}h`
            : 'not scheduled'}
        </td>
        <td className="mono">{usd(user.aumUsd)}</td>
        <td className="mono">{usd(user.attributedCostUsd30d)}</td>
        <td className="unknown-cell">Unknown</td>
      </tr>
      {props.expanded ? (
        <tr className="customer-detail-row">
          <td colSpan={8}>
            <CustomerDetail user={user} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

function CustomerDetail({ user }: { user: CustomerRecord }) {
  return (
    <div className="customer-detail">
      <DetailBlock title="Value">
        <DetailLine label="AUM" value={usd(user.aumUsd)} />
        <DetailLine label="Revenue" value="Unknown — no billing system" />
      </DetailBlock>

      <DetailBlock title="Cost">
        <DetailLine
          label="Provider requests (30d)"
          value={integer(user.requestCount30d)}
        />
        <DetailLine
          label="Attributed cost (30d)"
          value={usd(user.attributedCostUsd30d)}
        />
        <DetailLine label="Basis" value={user.costBasis ?? 'no cost data'} />
      </DetailBlock>

      <DetailBlock title="Activity">
        <DetailLine
          label="Last active"
          value={
            user.lastActivityAt ? relativeTime(user.lastActivityAt) : 'never'
          }
        />
        <DetailLine
          label="Portfolio age"
          value={hoursAgo(user.portfolioStaleHours)}
        />
        {/* The figure the freshness signal judges on. Shown next to the
            freshest one because seeing only the freshest is what let a dead
            wallet pass as a served account. */}
        <DetailLine
          label="Worst wallet age"
          value={hoursAgo(user.portfolioWorstStaleHours)}
        />
        <DetailLine
          label="Due for refresh"
          value={user.dueForRefresh ? 'yes' : 'no'}
        />
      </DetailBlock>

      <DetailBlock title="Service">
        <DetailLine label="Default from plan" value={user.defaultTier} />
        <DetailLine label="Override" value={user.overrideTier ?? 'none'} />
        <DetailLine label="Effective" value={user.effectiveTier} />
        {user.overrideReason ? (
          <DetailLine label="Reason" value={user.overrideReason} />
        ) : null}
        {user.overrideExpiresAt ? (
          <DetailLine
            label="Expires"
            value={relativeTime(user.overrideExpiresAt)}
          />
        ) : null}
        <ServiceControls user={user} />
      </DetailBlock>

      <DetailBlock title="Wallets">
        {user.wallets.map((wallet) => (
          <DetailLine
            key={wallet.wallet}
            label={wallet.wallet}
            value={
              wallet.lastPortfolioUpdateAt
                ? `${relativeTime(wallet.lastPortfolioUpdateAt)}${wallet.dueForRefresh ? ' · due' : ''}`
                : 'never refreshed'
            }
          />
        ))}
      </DetailBlock>
    </div>
  );
}

/**
 * Read-only on purpose. The server exposes no mutation endpoint for service
 * tiers yet, and a control that silently does nothing is worse than no
 * control: an operator would believe an account had been paused. Overrides are
 * applied by hand against `ops.user_service_overrides` until this is wired.
 */
function ServiceControls({ user }: { user: CustomerRecord }) {
  return (
    <div className="service-controls">
      <span className="wip-badge">WIP</span>
      <select
        aria-label="Service tier"
        disabled
        onChange={() => undefined}
        value={user.effectiveTier}
      >
        <option value="priority">priority</option>
        <option value="standard">standard</option>
        <option value="paused">paused</option>
      </select>
      <button disabled type="button">
        Apply override
      </button>
      <button disabled type="button">
        Return to plan default
      </button>
      <small>Apply overrides in SQL until this endpoint exists.</small>
    </div>
  );
}

function DetailBlock(props: { children: ReactNode; title: string }) {
  return (
    <div className="detail-block">
      <h3>{props.title}</h3>
      {props.children}
    </div>
  );
}

function DetailLine(props: { label: string; value: string }) {
  return (
    <div className="detail-line">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}
