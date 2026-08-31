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
  const users = sortUsersForDecision(data?.users ?? []);

  return (
    <div className="view-stack">
      <section
        aria-label="Service decisions"
        className="metric-strip metric-strip-four"
      >
        <Metric
          label="Priority service"
          value={integer(summary?.priorityUsers)}
        />
        <Metric
          label="Priority inactive 30d+"
          tone="warning"
          value={integer(summary?.inactiveButPriority)}
        />
        <Metric
          label="Observed AUM"
          tone="accent"
          value={usd(summary?.aumUsd)}
        />
        <Metric
          label="Portfolio fresh <24h"
          tone={
            freshnessRatio(product) !== null && freshnessRatio(product)! < 0.8
              ? 'warning'
              : undefined
          }
          value={percent(freshnessRatio(product))}
        />
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Product health</h2>
          <small className="panel-note">
            Coverage and freshness tell you whether the product numbers are safe
            to act on
          </small>
        </div>
        <div className="info-list product-health-list">
          <InfoRow
            label="Activation"
            notes={[
              `${integer(product?.portfolioUsers)} users have an observed portfolio`,
            ]}
            value={`${integer(product?.registeredUsers)} registered → ${integer(product?.verifiedWallets)} verified → ${integer(product?.portfolioUsers)} observed`}
          />
          <InfoRow
            label="Engagement"
            notes={[
              `${integer(summary?.activeLast7d)} customer accounts active in the last 7d`,
            ]}
            value={`${integer(product?.wau)} WAU / ${integer(product?.mau)} MAU`}
          />
          <InfoRow
            label="Freshness"
            notes={[
              `${integer(product?.portfolioFresh7d)} observed portfolios are fresh within 7d`,
            ]}
            value={`${integer(product?.portfolioFresh24h)} fresh <24h · ${percent(freshnessRatio(product))} of observed users`}
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
          <h2>Accounts needing judgment</h2>
          <small className="panel-note">
            Attention risks first, then AUM. Expand a row for plan, cost,
            refresh policy, and wallet-level evidence.
          </small>
        </div>
        <div className="table-wrap">
          <table className="data-table customers-table customers-table-compact">
            <thead>
              <tr>
                <th>User</th>
                <th>Service</th>
                <th>Last active†</th>
                <th>Portfolio freshness</th>
                <th>AUM</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
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
          It is not whole-product usage. Cost is DeBank&apos;s account invoice
          allocated by request volume, not a measured per-user charge.
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
        <td>
          <span className={`tier-pill ${user.effectiveTier}`}>
            {user.effectiveTier}
          </span>
          {user.overrideTier ? <small> override</small> : null}
        </td>
        <td className="cell-nowrap">{daysAgo(user.inactiveDays)}</td>
        <td className={freshnessClass(user)}>{freshnessLabel(user)}</td>
        <td className="mono">{usd(user.aumUsd)}</td>
      </tr>
      {props.expanded ? (
        <tr className="customer-detail-row">
          <td colSpan={5}>
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
        <DetailLine
          label="Worst wallet age"
          value={hoursAgo(user.portfolioWorstStaleHours)}
        />
        <DetailLine
          label="Never refreshed wallets"
          value={integer(user.neverRefreshedWallets)}
        />
        <DetailLine
          label="Due for refresh"
          value={user.dueForRefresh ? 'yes' : 'no'}
        />
      </DetailBlock>

      <DetailBlock title="Service">
        <DetailLine label="Plan" value={user.planCode} />
        <DetailLine label="Default from plan" value={user.defaultTier} />
        <DetailLine label="Override" value={user.overrideTier ?? 'none'} />
        <DetailLine label="Effective" value={user.effectiveTier} />
        <DetailLine
          label="Refresh interval"
          value={
            user.refreshIntervalHours
              ? `every ${user.refreshIntervalHours}h`
              : 'not scheduled'
          }
        />
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

function freshnessRatio(
  product: ProductHealthResponse | undefined,
): number | null {
  if (
    product?.portfolioFresh24h === null ||
    product?.portfolioFresh24h === undefined ||
    product.portfolioUsers === null ||
    product.portfolioUsers === undefined ||
    product.portfolioUsers <= 0
  ) {
    return null;
  }
  return product.portfolioFresh24h / product.portfolioUsers;
}

function freshnessLabel(user: CustomerRecord): string {
  if (user.neverRefreshedWallets > 0) {
    return `${integer(user.neverRefreshedWallets)} never refreshed`;
  }
  const age = hoursAgo(user.portfolioWorstStaleHours);
  return user.dueForRefresh ? `${age} · due` : age;
}

function freshnessClass(user: CustomerRecord): string {
  return user.neverRefreshedWallets > 0 ||
    (user.portfolioWorstStaleHours ?? 0) >= 48
    ? 'cell-nowrap warning-text'
    : 'cell-nowrap';
}

function sortUsersForDecision(users: CustomerRecord[]): CustomerRecord[] {
  return [...users].sort(
    (left, right) =>
      decisionRisk(right) - decisionRisk(left) ||
      (right.aumUsd ?? 0) - (left.aumUsd ?? 0) ||
      left.userId.localeCompare(right.userId),
  );
}

function decisionRisk(user: CustomerRecord): number {
  let risk = user.effectiveTier === 'priority' ? 1 : 0;
  if (user.effectiveTier === 'priority' && (user.inactiveDays ?? 0) >= 30) {
    risk += 8;
  }
  if (user.neverRefreshedWallets > 0) {
    risk += 10;
  }
  if ((user.portfolioWorstStaleHours ?? 0) >= 48) {
    risk += 6;
  }
  if (user.dueForRefresh) {
    risk += 2;
  }
  return risk;
}
