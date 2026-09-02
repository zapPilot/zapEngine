import { type ReactNode, useState } from 'react';

import type { StatementsResponse } from '../../shared/statements.js';
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
import { Funnel, type FunnelRow } from './Funnel.js';
import { InfoRow } from './InfoRow.js';
import { SegmentBar } from './SegmentBar.js';
import { StatementHeader } from './StatementHeader.js';

const INACTIVE_WINDOW_DAYS = 30;
const STALE_WALLET_HOURS = 48;

export function ProductView(props: {
  customers: CustomerEconomicsResponse | null;
  product: ProductHealthResponse | undefined;
  statements?: StatementsResponse | null;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const data = props.customers;
  const product = props.product;
  const header = props.statements?.headers.find((h) => h.domain === 'product');
  const allUsers = sortUsersForDecision(data?.users ?? []);
  const flagged = allUsers.filter(tripsRule);
  const visibleUsers = showAll ? allUsers : flagged;
  const ratio = freshnessRatio(product);

  const funnelRows: FunnelRow[] = [
    {
      label: 'Registered',
      value: integer(product?.registeredUsers),
      share: product?.registeredUsers ?? 0,
    },
    {
      label: 'Verified',
      value: integer(product?.verifiedWallets),
      share: product?.verifiedWallets ?? 0,
    },
    {
      label: 'Observed',
      value: integer(product?.portfolioUsers),
      share: product?.portfolioUsers ?? 0,
    },
    {
      label: 'Active 7d',
      value: integer(product?.wau),
      share: product?.wau ?? 0,
    },
    {
      label: 'Active + fresh',
      value: integer(product?.activePortfolios7d),
      share: product?.activePortfolios7d ?? 0,
      star: true,
    },
  ];

  const observed = product?.portfolioUsers ?? null;
  const fresh24h = product?.portfolioFresh24h ?? null;
  const fresh7d = product?.portfolioFresh7d ?? null;
  const mid =
    fresh7d !== null && fresh24h !== null
      ? Math.max(0, fresh7d - fresh24h)
      : null;
  const older =
    observed !== null && fresh7d !== null
      ? Math.max(0, observed - fresh7d)
      : null;

  const top1 = product?.top1PortfolioShare ?? null;
  const top3 = product?.top3PortfolioShare ?? null;
  const next2 =
    top1 !== null && top3 !== null ? Math.max(0, top3 - top1) : null;
  const rest = top3 !== null ? Math.max(0, 1 - top3) : null;

  return (
    <div className="view-stack">
      {header ? (
        <StatementHeader
          facts={header.facts}
          sentence={header.sentence}
          status={header.status}
        />
      ) : null}

      <div className="product-upper">
        <section className="panel">
          <div className="panel-head">
            <h2>Funnel to the north star</h2>
            <small className="panel-note">
              Each step as a share of the one before
            </small>
          </div>
          <Funnel rows={funnelRows} />
        </section>

        <div className="product-side">
          <section className="panel product-segment-panel">
            <div className="panel-head">
              <h2>Portfolio freshness</h2>
              <small className="panel-note">
                {percent(ratio)} fresh &lt;24h
              </small>
            </div>
            <div className="product-segment-body">
              <SegmentBar
                segments={[
                  {
                    label: `${integer(fresh24h)} fresh <24h`,
                    share: safeRatio(fresh24h, observed),
                    color: 'var(--success)',
                  },
                  {
                    label: `${integer(mid)} <7d`,
                    share: safeRatio(mid, observed),
                    color: 'var(--accent-muted)',
                  },
                  {
                    label: `${integer(older)} older`,
                    share: safeRatio(older, observed),
                    color: 'var(--error)',
                  },
                ]}
              />
            </div>
          </section>
          <section className="panel product-segment-panel">
            <div className="panel-head">
              <h2>Concentration of observed AUM</h2>
              <small className="panel-note">
                {usd(product?.observedPortfolioUsd)}
              </small>
            </div>
            <div className="product-segment-body">
              <SegmentBar
                segments={[
                  {
                    label: `Top wallet ${percent(top1)}`,
                    share: top1 ?? 0,
                    color: 'var(--accent)',
                  },
                  {
                    label: `Next two ${percent(next2)}`,
                    share: next2 ?? 0,
                    color: 'var(--accent-muted)',
                  },
                  {
                    label: `Rest ${percent(rest)}`,
                    share: rest ?? 0,
                    color: 'var(--line-hi)',
                  },
                ]}
              />
              <p className="product-segment-note">
                AUM moves with one customer and with BTC; treat it as context,
                not a growth metric.
              </p>
            </div>
          </section>
        </div>
      </div>

      <section className="panel">
        <div className="panel-head">
          <h2>Accounts needing judgment</h2>
          <small className="panel-note">
            {showAll
              ? `All ${integer(allUsers.length)} accounts`
              : `${integer(flagged.length)} of ${integer(allUsers.length)} accounts tripped a rule`}
          </small>
        </div>
        <div className="table-wrap">
          <table className="data-table customers-table customers-table-compact">
            <thead>
              <tr>
                <th>User</th>
                <th>Service</th>
                <th>Why</th>
                <th>Last active†</th>
                <th>Portfolio freshness</th>
                <th>AUM</th>
              </tr>
            </thead>
            <tbody>
              {visibleUsers.map((user) => (
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
          {data && visibleUsers.length === 0 ? (
            <div className="empty-inline">
              {showAll
                ? (data.message ?? 'No customers returned.')
                : 'Nothing tripped a rule.'}
            </div>
          ) : null}
          {data ? null : <div className="empty-inline">Waiting for data.</div>}
        </div>
        {data && allUsers.length > 0 ? (
          <div className="panel-foot">
            <button
              className="panel-link"
              onClick={() => setShowAll((value) => !value)}
              type="button"
            >
              {showAll
                ? 'Show only flagged accounts'
                : `Show all ${integer(allUsers.length)} accounts`}
            </button>
          </div>
        ) : null}
        <small className="table-footnote">
          † account-engine route activity (dashboard visits), debounced hourly.
          It is not whole-product usage. Cost is DeBank&apos;s account invoice
          allocated by request volume, not a measured per-user charge.
        </small>
      </section>

      <details className="panel decision-disclosure">
        <summary className="decision-disclosure-summary">
          <strong>More detail</strong>
          <span>Activation, engagement and concentration, spelled out</span>
        </summary>
        <div className="decision-disclosure-body">
          <div className="disclosure-section info-list">
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
                `${integer(data?.summary.activeLast7d)} customer accounts active in the last 7d`,
              ]}
              value={`${integer(product?.wau)} WAU / ${integer(product?.mau)} MAU`}
            />
          </div>
        </div>
      </details>
    </div>
  );
}

function CustomerRows(props: {
  expanded: boolean;
  onToggle: () => void;
  user: CustomerRecord;
}) {
  const { user } = props;
  const reason = judgmentReason(user);
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
        <td className="cell-nowrap">{reason ?? '—'}</td>
        <td className="cell-nowrap">{daysAgo(user.inactiveDays)}</td>
        <td className={freshnessClass(user)}>{freshnessLabel(user)}</td>
        <td className="mono">{usd(user.aumUsd)}</td>
      </tr>
      {props.expanded ? (
        <tr className="customer-detail-row">
          <td colSpan={6}>
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

function safeRatio(value: number | null, total: number | null): number {
  if (value === null || total === null || total <= 0) {
    return 0;
  }
  return value / total;
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
    (user.portfolioWorstStaleHours ?? 0) >= STALE_WALLET_HOURS
    ? 'cell-nowrap warning-text'
    : 'cell-nowrap';
}

/** The three conditions "Accounts needing judgment" filters on. */
function tripsRule(user: CustomerRecord): boolean {
  const priorityInactive =
    user.effectiveTier === 'priority' &&
    (user.inactiveDays === null || user.inactiveDays >= INACTIVE_WINDOW_DAYS);
  const neverRefreshed = user.neverRefreshedWallets > 0;
  const worstStale = (user.portfolioWorstStaleHours ?? 0) >= STALE_WALLET_HOURS;
  return priorityInactive || neverRefreshed || worstStale;
}

function judgmentReason(user: CustomerRecord): string | null {
  if (
    user.effectiveTier === 'priority' &&
    (user.inactiveDays === null || user.inactiveDays >= INACTIVE_WINDOW_DAYS)
  ) {
    return `Priority, inactive ${user.inactiveDays === null ? 'unknown' : `${integer(user.inactiveDays)}d`}`;
  }
  if (user.neverRefreshedWallets > 0) {
    return `${integer(user.neverRefreshedWallets)} wallet${user.neverRefreshedWallets === 1 ? '' : 's'} never refreshed`;
  }
  if ((user.portfolioWorstStaleHours ?? 0) >= STALE_WALLET_HOURS) {
    return `Worst wallet ${hoursAgo(user.portfolioWorstStaleHours)} old`;
  }
  return null;
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
