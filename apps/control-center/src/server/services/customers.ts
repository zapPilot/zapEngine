import type {
  CustomerEconomicsResponse,
  CustomerRecord,
  CustomerWalletSummary,
  OperationalSignal,
  ServiceTier,
} from '../../shared/types.js';
import type { ControlCenterConfig } from '../config/env.js';
import { elapsedMs } from './elapsed.js';
import { sumKnown } from './numbers.js';
import {
  buildSignal,
  sourceFailure,
  unknownSignal,
} from './operations/signal.js';
import { createSchemaClient, walletFreshness } from './wallet-freshness.js';

/**
 * Row shape of `public.get_user_service_states()`. That function is the single
 * source of truth for effective service policy — the ETL that spends the money
 * reads the same rows — so nothing here re-derives a tier or a due-for-refresh
 * decision. Doing so is exactly how a dashboard ends up reporting Standard for
 * an account the pipeline is still billing as Priority.
 */
interface ServiceStateRow {
  user_id: string;
  email: string | null;
  wallet: string;
  plan_code: string | null;
  last_activity_at: string | null;
  last_portfolio_update_at: string | null;
  default_tier: string | null;
  override_tier: string | null;
  override_reason: string | null;
  override_expires_at: string | null;
  effective_tier: string | null;
  refresh_interval_hours: number | string | null;
  due_for_refresh: boolean | null;
  aum_usd: number | string | null;
  source_states?: unknown;
}

interface UsageRow {
  user_id: string | null;
  provider: string | null;
  request_count: number | string | null;
}

interface CostSnapshotRow {
  accrued_cost_usd: number | string | null;
  projected_cost_usd: number | string | null;
}

type ClientFactory = typeof createSchemaClient;

const DAY_MS = 86_400_000;
const USAGE_WINDOW_DAYS = 30;
const ACTIVE_WINDOW_DAYS = 7;
const INACTIVE_WINDOW_DAYS = 30;
/**
 * A Priority wallet whose portfolio has not refreshed in two days is not a
 * scheduling wobble — the daily job either did not run or is failing for that
 * wallet, and the number the customer sees is two days old.
 */
const PORTFOLIO_STALE_HOURS = 48;
const AUM_AT_RISK_FLOOR_USD = 10_000;

const EMPTY_SUMMARY: CustomerEconomicsResponse['summary'] = {
  totalCustomers: 0,
  priorityUsers: 0,
  standardUsers: 0,
  pausedUsers: 0,
  activeLast7d: 0,
  inactiveButPriority: 0,
  aumUsd: null,
  attributedCostUsd30d: null,
  revenueUsd: null,
};

export async function loadCustomerEconomics(input: {
  config: ControlCenterConfig;
  now: Date;
  createSupabaseClient?: ClientFactory;
}): Promise<CustomerEconomicsResponse> {
  const { SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key } = input.config;
  const generatedAt = input.now.toISOString();
  if (!url || !key) {
    return {
      generatedAt,
      status: 'unconfigured',
      message: 'Supabase is not connected',
      summary: EMPTY_SUMMARY,
      users: [],
    };
  }

  const create = input.createSupabaseClient ?? createSchemaClient;
  try {
    // Two clients on purpose: the policy function lives in `public`, while the
    // usage ledger is reachable only through the from_fed_to_chain bridge views
    // that keep the private `ops` schema out of PostgREST.
    const policyClient = create(url, key, 'public');
    const bridgeClient = create(url, key, input.config.SUPABASE_DB_SCHEMA);
    const usageSince = new Date(
      input.now.getTime() - USAGE_WINDOW_DAYS * DAY_MS,
    );

    const [policy, usage, debankCost] = await Promise.all([
      policyClient.rpc('get_user_service_states'),
      bridgeClient
        .from('ops_user_resource_usage_daily')
        .select('user_id,provider,request_count')
        .gte('usage_date', usageSince.toISOString().slice(0, 10)),
      bridgeClient
        .from('ops_cost_snapshots')
        .select('accrued_cost_usd,projected_cost_usd')
        .eq('provider', 'debank')
        .order('snapshot_date', { ascending: false })
        .limit(1),
    ]);
    if (policy.error) {
      throw policy.error;
    }

    // The usage ledger and the cost ledger are both optional inputs: this
    // shipped before alpha-etl had recorded a single attribution row, and an
    // empty ledger must read as "no cost data yet", not as a broken page.
    const usageRows = usage.error ? [] : ((usage.data ?? []) as UsageRow[]);
    const costRow = debankCost.error
      ? null
      : (((debankCost.data ?? []) as CostSnapshotRow[])[0] ?? null);

    const users = buildCustomers({
      rows: (policy.data ?? []) as ServiceStateRow[],
      usageRows,
      debankAccountCostUsd: debankAccountCost(costRow),
      now: input.now,
    });

    return {
      generatedAt,
      status: 'ok',
      message: usage.error ? 'Usage ledger unavailable' : null,
      summary: summarize(users),
      users,
    };
  } catch (error) {
    return {
      generatedAt,
      status: 'error',
      message: error instanceof Error ? error.message : 'Customer query failed',
      summary: EMPTY_SUMMARY,
      users: [],
    };
  }
}

/**
 * Signals the aggregate folds into the `customers` domain. Both of them answer
 * a question the rest of the dashboard cannot: money spent on accounts that
 * stopped showing up, and Priority accounts silently being served stale data.
 */
export function deriveCustomerSignals(
  response: CustomerEconomicsResponse,
  now: Date,
): OperationalSignal[] {
  if (response.status === 'unconfigured') {
    return [
      unknownSignal({
        source: 'customer-economics',
        domain: 'customers',
        key: 'supabase',
        title: 'Customer economics not connected',
        detail: 'Supabase credentials are absent',
        observedAt: now,
      }),
    ];
  }
  if (response.status === 'error') {
    return [
      sourceFailure({
        source: 'customer-economics',
        domain: 'customers',
        error: new Error(response.message ?? 'Customer query failed'),
        observedAt: now,
      }),
    ];
  }

  return [wasteSignal(response, now), freshnessSignal(response, now)];
}

function wasteSignal(
  response: CustomerEconomicsResponse,
  now: Date,
): OperationalSignal {
  const wasted = response.users.filter(isInactivePriority);
  const cost = sumRounded(wasted.map((user) => user.attributedCostUsd30d));
  return buildSignal({
    source: 'customer-economics',
    domain: 'customers',
    kind: 'waste',
    key: 'inactive-priority',
    status: wasted.length > 0 ? 'degraded' : 'healthy',
    title:
      wasted.length > 0
        ? `${wasted.length} priority accounts inactive for ${INACTIVE_WINDOW_DAYS}+ days`
        : 'Every priority account is active',
    detail:
      wasted.length > 0
        ? 'Refreshed daily at full cost while nobody is looking at the result'
        : null,
    evidence: {
      affectedUsers: wasted.length,
      estimatedMonthlyCostUsd: cost,
      priorityUsers: response.summary.priorityUsers,
    },
    observedAt: now,
  });
}

function freshnessSignal(
  response: CustomerEconomicsResponse,
  now: Date,
): OperationalSignal {
  // A wallet nothing has ever refreshed has no age, and the version of this
  // filter that compared ages alone therefore dropped it and reported the
  // account healthy — the loudest possible failure reading as the quietest.
  const stale = response.users
    .filter(
      (user) =>
        user.effectiveTier === 'priority' &&
        (user.neverRefreshedWallets > 0 ||
          (user.portfolioWorstStaleHours ?? -1) >= PORTFOLIO_STALE_HOURS),
    )
    .sort((left, right) => (right.aumUsd ?? 0) - (left.aumUsd ?? 0));
  const worst = stale[0];
  const aumAtRisk = sumRounded(stale.map((user) => user.aumUsd));
  const neverRefreshed = stale.reduce(
    (total, user) => total + user.neverRefreshedWallets,
    0,
  );
  const status =
    stale.length === 0
      ? 'healthy'
      : aumAtRisk !== null && aumAtRisk > AUM_AT_RISK_FLOOR_USD
        ? 'critical'
        : 'degraded';

  return buildSignal({
    source: 'customer-economics',
    domain: 'customers',
    kind: 'freshness',
    key: 'priority-portfolios',
    status,
    title:
      stale.length > 0
        ? `${stale.length} priority portfolios older than ${PORTFOLIO_STALE_HOURS}h or never refreshed`
        : 'Priority portfolios are current',
    detail: worst ? describeWorst(worst) : null,
    evidence: {
      affectedUsers: stale.length,
      aumAtRiskUsd: aumAtRisk,
      staleHours: worst?.portfolioWorstStaleHours ?? null,
      neverRefreshedWallets: neverRefreshed,
      topUser: worst?.email ?? worst?.userId ?? null,
    },
    observedAt: now,
  });
}

/**
 * A never-refreshed wallet outranks any age: reporting it as "at 0h" — the
 * only thing a missing age can round to — would describe the worst account on
 * the list as the freshest one.
 */
function describeWorst(user: CustomerRecord): string {
  const who = user.email ?? user.userId;
  if (user.neverRefreshedWallets > 0) {
    const count = user.neverRefreshedWallets;
    return `Worst: ${who} has ${count} wallet${count === 1 ? '' : 's'} that never refreshed`;
  }
  return `Worst: ${who} at ${Math.round(user.portfolioWorstStaleHours ?? 0)}h`;
}

function buildCustomers(input: {
  rows: ServiceStateRow[];
  usageRows: UsageRow[];
  debankAccountCostUsd: number | null;
  now: Date;
}): CustomerRecord[] {
  const totals = usageTotals(input.usageRows);
  const grouped = new Map<string, ServiceStateRow[]>();
  for (const row of input.rows) {
    if (!row.user_id || !row.wallet) {
      continue;
    }
    grouped.set(row.user_id, [...(grouped.get(row.user_id) ?? []), row]);
  }

  return [...grouped.entries()]
    .map(([userId, rows]) => toCustomer(userId, rows, totals, input))
    .sort(
      (left, right) =>
        (right.aumUsd ?? 0) - (left.aumUsd ?? 0) ||
        left.userId.localeCompare(right.userId),
    );
}

function toCustomer(
  userId: string,
  rows: ServiceStateRow[],
  totals: UsageTotals,
  input: { debankAccountCostUsd: number | null; now: Date },
): CustomerRecord {
  const head = rows[0]!;
  const wallets: CustomerWalletSummary[] = rows.map((row) => ({
    wallet: row.wallet,
    lastPortfolioUpdateAt: row.last_portfolio_update_at,
    dueForRefresh: row.due_for_refresh === true,
  }));
  const perUser = totals.perUser.get(userId);
  const debankRequests = perUser?.debank ?? 0;
  const freshness = portfolioFreshness(rows, input.now);

  return {
    userId,
    email: head.email,
    planCode: head.plan_code ?? 'unknown',
    defaultTier: toTier(head.default_tier),
    overrideTier: head.override_tier ? toTier(head.override_tier) : null,
    overrideReason: head.override_reason,
    overrideExpiresAt: head.override_expires_at,
    effectiveTier: toTier(head.effective_tier),
    refreshIntervalHours: toNumber(head.refresh_interval_hours),
    lastActivityAt: head.last_activity_at,
    inactiveDays: elapsedDays(head.last_activity_at, input.now),
    aumUsd: toNumber(head.aum_usd),
    wallets,
    portfolioStaleHours: freshness.freshest,
    portfolioWorstStaleHours: freshness.worst,
    neverRefreshedWallets: freshness.neverRefreshed,
    dueForRefresh: wallets.some((wallet) => wallet.dueForRefresh),
    requestCount30d: (perUser?.debank ?? 0) + (perUser?.other ?? 0),
    attributedCostUsd30d: allocate(
      debankRequests,
      totals.debank,
      input.debankAccountCostUsd,
    ),
    costBasis:
      input.debankAccountCostUsd === null ? null : 'allocated_estimate',
    // Nothing in this repository bills anybody. Rendering a plausible number
    // here would make the unit-economics view worse than having none.
    revenueUsd: null,
  };
}

interface UsageTotals {
  debank: number;
  perUser: Map<string, { debank: number; other: number }>;
}

function usageTotals(rows: UsageRow[]): UsageTotals {
  const perUser = new Map<string, { debank: number; other: number }>();
  let debank = 0;
  for (const row of rows) {
    const count = toNumber(row.request_count) ?? 0;
    if (!row.user_id || count <= 0) {
      continue;
    }
    const bucket = perUser.get(row.user_id) ?? { debank: 0, other: 0 };
    if (row.provider === 'debank') {
      bucket.debank += count;
      debank += count;
    } else {
      bucket.other += count;
    }
    perUser.set(row.user_id, bucket);
  }
  return { debank, perUser };
}

/**
 * DeBank prices an account, not an endpoint: there is one monthly figure in
 * API units and no published per-call rate. A user's share of that invoice by
 * request volume is the most honest number available, and it is only ever
 * reported as `allocated_estimate` so nobody mistakes it for a measurement.
 */
function allocate(
  userRequests: number,
  totalRequests: number,
  accountCostUsd: number | null,
): number | null {
  if (accountCostUsd === null || totalRequests <= 0 || userRequests <= 0) {
    return null;
  }
  return round(accountCostUsd * (userRequests / totalRequests), 4);
}

function debankAccountCost(row: CostSnapshotRow | null): number | null {
  if (!row) {
    return null;
  }
  return toNumber(row.accrued_cost_usd) ?? toNumber(row.projected_cost_usd);
}

function summarize(
  users: CustomerRecord[],
): CustomerEconomicsResponse['summary'] {
  const byTier = (tier: ServiceTier) =>
    users.filter((user) => user.effectiveTier === tier).length;
  return {
    totalCustomers: users.length,
    priorityUsers: byTier('priority'),
    standardUsers: byTier('standard'),
    pausedUsers: byTier('paused'),
    activeLast7d: users.filter(
      (user) =>
        user.inactiveDays !== null && user.inactiveDays < ACTIVE_WINDOW_DAYS,
    ).length,
    inactiveButPriority: users.filter(isInactivePriority).length,
    aumUsd: sumRounded(users.map((user) => user.aumUsd)),
    attributedCostUsd30d: sumRounded(
      users.map((user) => user.attributedCostUsd30d),
    ),
    revenueUsd: null,
  };
}

function isInactivePriority(user: CustomerRecord): boolean {
  return (
    user.effectiveTier === 'priority' &&
    (user.inactiveDays === null || user.inactiveDays >= INACTIVE_WINDOW_DAYS)
  );
}

/**
 * Both ends of the account's spread, because they answer different questions.
 * The freshest wallet says what the customer sees on their dashboard; the
 * stalest one, plus the wallets with no reading at all, says whether we are
 * holding up our end. Judging on the freshest is what let a dead wallet hide
 * behind a live one.
 */
function portfolioFreshness(
  rows: ServiceStateRow[],
  now: Date,
): { freshest: number | null; worst: number | null; neverRefreshed: number } {
  const ages: number[] = [];
  let neverRefreshed = 0;
  for (const row of rows) {
    const freshness = walletFreshness(row, now);
    if (freshness.neverRefreshed) {
      neverRefreshed += 1;
    }
    if (freshness.ageHours !== null) {
      ages.push(freshness.ageHours);
    }
  }
  return {
    freshest: ages.length ? Math.min(...ages) : null,
    worst: ages.length ? Math.max(...ages) : null,
    neverRefreshed,
  };
}

function toTier(value: string | null): ServiceTier {
  return value === 'priority' || value === 'paused' ? value : 'standard';
}

function toNumber(value: number | string | null): number | null {
  if (value === null) {
    return null;
  }
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function elapsedDays(value: string | null, now: Date): number | null {
  const elapsed = elapsedMs(value, now);
  return elapsed === null ? null : Math.floor(elapsed / DAY_MS);
}

/**
 * Rounded because every total here is either an allocation or a sum of them,
 * and floating-point tails would render as `$40.000000000000006` on a page
 * whose whole point is that the number is an estimate you can reason about.
 */
function sumRounded(values: Array<number | null>): number | null {
  const total = sumKnown(values);
  return total === null ? null : round(total, 4);
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
