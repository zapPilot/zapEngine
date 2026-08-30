import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import type { CustomerEconomicsResponse } from '../../shared/types.js';

import { readControlCenterConfig } from '../config/env.js';
import { deriveCustomerSignals, loadCustomerEconomics } from './customers.js';

const NOW = new Date('2026-08-28T12:00:00.000Z');

const CONFIGURED = readControlCenterConfig({
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
});

interface QueryResult {
  data: unknown;
  error: unknown;
}

interface Chain {
  select: () => Chain;
  eq: () => Chain;
  order: () => Chain;
  gte: () => Promise<QueryResult>;
  limit: () => Promise<QueryResult>;
}

function tableStub(result: QueryResult): Chain {
  const chain: Chain = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    gte: () => Promise.resolve(result),
    limit: () => Promise.resolve(result),
  };
  return chain;
}

function factory(input: {
  policy: QueryResult;
  usage?: QueryResult;
  cost?: QueryResult;
}) {
  const empty: QueryResult = { data: [], error: null };
  return (_url: string, _key: string, schema: string) =>
    (schema === 'public'
      ? { rpc: () => Promise.resolve(input.policy) }
      : {
          from: (table: string) =>
            tableStub(
              table === 'ops_user_resource_usage_daily'
                ? (input.usage ?? empty)
                : (input.cost ?? empty),
            ),
        }) as unknown as SupabaseClient;
}

function stateRow(overrides: Record<string, unknown>) {
  return {
    user_id: 'user-1',
    email: 'one@example.com',
    wallet: '0x1',
    plan_code: 'vip',
    last_activity_at: '2026-08-26T12:00:00.000Z',
    last_portfolio_update_at: '2026-08-28T11:00:00.000Z',
    default_tier: 'priority',
    override_tier: null,
    override_reason: null,
    override_expires_at: null,
    effective_tier: 'priority',
    refresh_interval_hours: 24,
    due_for_refresh: false,
    aum_usd: 50_000,
    ...overrides,
  };
}

/**
 * `source_states` as the RPC returns it: one `last_success_at` per provider,
 * which is the only part of the payload these cases vary.
 */
function sourceStates(sources: Record<string, string | null>) {
  return Object.fromEntries(
    Object.entries(sources).map(([name, at]) => [
      name,
      { last_success_at: at },
    ]),
  );
}

const POLICY_ROWS = [
  stateRow({}),
  stateRow({
    user_id: 'user-2',
    email: 'two@example.com',
    wallet: '0x2',
    last_activity_at: '2026-05-30T12:00:00.000Z',
    last_portfolio_update_at: '2026-08-24T08:00:00.000Z',
    due_for_refresh: true,
    aum_usd: '25000',
  }),
  stateRow({
    user_id: 'user-3',
    email: null,
    wallet: '0x3',
    plan_code: 'free',
    last_activity_at: null,
    last_portfolio_update_at: null,
    default_tier: 'standard',
    effective_tier: 'standard',
    refresh_interval_hours: null,
    aum_usd: null,
  }),
];

const USAGE_ROWS = [
  { user_id: 'user-1', provider: 'debank', request_count: 60 },
  { user_id: 'user-2', provider: 'debank', request_count: '20' },
  { user_id: 'user-2', provider: 'hyperliquid', request_count: 10 },
];

function loadPolicy(policy: QueryResult) {
  return loadCustomerEconomics({
    config: CONFIGURED,
    now: NOW,
    createSupabaseClient: factory({ policy }),
  });
}

function loadRows(rows: unknown[]) {
  return loadPolicy({ data: rows, error: null });
}

function loadHappyPath(overrides: Partial<Parameters<typeof factory>[0]> = {}) {
  return loadCustomerEconomics({
    config: CONFIGURED,
    now: NOW,
    createSupabaseClient: factory({
      policy: { data: POLICY_ROWS, error: null },
      usage: { data: USAGE_ROWS, error: null },
      cost: {
        data: [{ accrued_cost_usd: 40, projected_cost_usd: 60 }],
        error: null,
      },
      ...overrides,
    }),
  });
}

describe('loadCustomerEconomics', () => {
  it('reports unconfigured without touching Supabase', async () => {
    const response = await loadCustomerEconomics({
      config: readControlCenterConfig({}),
      now: NOW,
      createSupabaseClient: () => {
        throw new Error('must not create a client');
      },
    });

    expect(response.status).toBe('unconfigured');
    expect(response.users).toEqual([]);
    expect(response.summary.totalCustomers).toBe(0);
  });

  it('joins policy, usage and cost into per-user economics', async () => {
    const response = await loadHappyPath();

    expect(response.status).toBe('ok');
    expect(response.users.map((user) => user.userId)).toEqual([
      'user-1',
      'user-2',
      'user-3',
    ]);

    const [first, second, third] = response.users;
    expect(first?.attributedCostUsd30d).toBe(30);
    expect(first?.requestCount30d).toBe(60);
    expect(first?.costBasis).toBe('allocated_estimate');
    expect(first?.portfolioStaleHours).toBe(1);
    expect(first?.inactiveDays).toBe(2);

    // Numeric columns arrive from PostgREST as strings often enough that the
    // coercion is load-bearing, not defensive noise.
    expect(second?.aumUsd).toBe(25_000);
    expect(second?.requestCount30d).toBe(30);
    expect(second?.attributedCostUsd30d).toBe(10);
    expect(second?.dueForRefresh).toBe(true);

    expect(third?.effectiveTier).toBe('standard');
    expect(third?.attributedCostUsd30d).toBeNull();
    expect(third?.portfolioStaleHours).toBeNull();
    expect(third?.inactiveDays).toBeNull();
  });

  it('summarizes tiers, activity and waste', async () => {
    const { summary } = await loadHappyPath();

    expect(summary).toMatchObject({
      totalCustomers: 3,
      priorityUsers: 2,
      standardUsers: 1,
      pausedUsers: 0,
      activeLast7d: 1,
      inactiveButPriority: 1,
      aumUsd: 75_000,
      attributedCostUsd30d: 40,
      revenueUsd: null,
    });
  });

  it('keeps serving policy when the usage ledger is unavailable', async () => {
    const response = await loadHappyPath({
      usage: { data: null, error: { message: 'relation does not exist' } },
    });

    expect(response.status).toBe('ok');
    expect(response.message).toBe('Usage ledger unavailable');
    expect(response.users[0]?.attributedCostUsd30d).toBeNull();
    expect(response.users[0]?.requestCount30d).toBe(0);
  });

  it('leaves cost unattributed when no DeBank snapshot exists', async () => {
    const response = await loadHappyPath({ cost: { data: [], error: null } });

    expect(response.users[0]?.attributedCostUsd30d).toBeNull();
    expect(response.users[0]?.costBasis).toBeNull();
  });

  it('falls back to the projected cost when nothing has accrued yet', async () => {
    const response = await loadHappyPath({
      cost: {
        data: [{ accrued_cost_usd: null, projected_cost_usd: 80 }],
        error: null,
      },
    });

    expect(response.users[0]?.attributedCostUsd30d).toBe(60);
  });

  it('reports an error response when the policy function fails', async () => {
    const response = await loadPolicy({
      data: null,
      error: new Error('function does not exist'),
    });

    expect(response.status).toBe('error');
    expect(response.message).toContain('function does not exist');
    expect(response.summary.totalCustomers).toBe(0);
  });

  it('treats an override as the effective tier and groups wallets per user', async () => {
    const response = await loadRows([
      stateRow({
        override_tier: 'paused',
        override_reason: 'dormant',
        override_expires_at: '2026-12-01T00:00:00.000Z',
        effective_tier: 'paused',
        refresh_interval_hours: null,
        last_portfolio_update_at: '2026-08-20T12:00:00.000Z',
      }),
      stateRow({
        wallet: '0x1b',
        override_tier: 'paused',
        effective_tier: 'paused',
        refresh_interval_hours: null,
        last_portfolio_update_at: '2026-08-28T10:00:00.000Z',
      }),
    ]);

    const [user] = response.users;
    expect(response.users).toHaveLength(1);
    expect(user?.wallets.map((wallet) => wallet.wallet)).toEqual([
      '0x1',
      '0x1b',
    ]);
    expect(user?.effectiveTier).toBe('paused');
    expect(user?.overrideReason).toBe('dormant');
    // The freshest wallet decides: one current wallet means the account is
    // being served current data.
    expect(user?.portfolioStaleHours).toBe(2);
    expect(user?.portfolioWorstStaleHours).toBe(192);
    expect(user?.neverRefreshedWallets).toBe(0);
    expect(response.summary.pausedUsers).toBe(1);
  });

  it('drops rows without a user or a wallet', async () => {
    const response = await loadRows([
      stateRow({ user_id: null }),
      stateRow({ user_id: 'user-9', wallet: '' }),
      stateRow({ user_id: 'user-8', wallet: '0x8' }),
    ]);

    expect(response.users.map((user) => user.userId)).toEqual(['user-8']);
  });
});

describe('deriveCustomerSignals', () => {
  function onlySignal(response: CustomerEconomicsResponse) {
    const signals = deriveCustomerSignals(response, NOW);
    expect(signals).toHaveLength(1);
    return signals[0];
  }

  it('emits a single unknown signal when Supabase is absent', async () => {
    const signal = onlySignal(
      await loadCustomerEconomics({
        config: readControlCenterConfig({}),
        now: NOW,
      }),
    );

    expect(signal?.status).toBe('unknown');
  });

  it('emits a source failure when the query failed', async () => {
    const signal = onlySignal(
      await loadPolicy({ data: null, error: new Error('boom') }),
    );

    expect(signal?.status).toBe('degraded');
    expect(signal?.fingerprint).toBe(
      'customer-economics:source-failure/adapter',
    );
  });

  it('flags inactive priority accounts and stale high-AUM portfolios', async () => {
    const signals = deriveCustomerSignals(await loadHappyPath(), NOW);
    const [wasteSignal, freshness] = signals;

    expect(wasteSignal?.fingerprint).toBe(
      'customer-economics:waste/inactive-priority',
    );
    expect(wasteSignal?.status).toBe('degraded');
    expect(wasteSignal?.evidence['affectedUsers']).toBe(1);
    expect(wasteSignal?.evidence['estimatedMonthlyCostUsd']).toBe(10);

    expect(freshness?.fingerprint).toBe(
      'customer-economics:freshness/priority-portfolios',
    );
    // $25k of AUM behind a four-day-old portfolio is not a "degraded" problem.
    expect(freshness?.status).toBe('critical');
    expect(freshness?.evidence['aumAtRiskUsd']).toBe(25_000);
    expect(freshness?.evidence['topUser']).toBe('two@example.com');
  });

  it('stays healthy when every priority account is active and current', async () => {
    const response = await loadRows([stateRow({})]);

    const signals = deriveCustomerSignals(response, NOW);
    expect(signals.map((signal) => signal.status)).toEqual([
      'healthy',
      'healthy',
    ]);
  });

  it('degrades rather than escalates when the stale AUM is small', async () => {
    const response = await loadRows([
      stateRow({
        last_portfolio_update_at: '2026-08-24T08:00:00.000Z',
        aum_usd: 500,
      }),
    ]);

    const [, freshness] = deriveCustomerSignals(response, NOW);
    expect(freshness?.status).toBe('degraded');
    expect(freshness?.evidence['staleHours']).toBeCloseTo(100, 5);
  });

  it('flags a priority wallet that has never been refreshed', async () => {
    const response = await loadRows([
      stateRow({ last_portfolio_update_at: null, aum_usd: 500 }),
    ]);

    const [, freshness] = deriveCustomerSignals(response, NOW);
    // No reading is not a small age, and the version that compared ages alone
    // reported this account as healthy.
    expect(freshness?.status).toBe('degraded');
    expect(response.users[0]?.neverRefreshedWallets).toBe(1);
    expect(freshness?.evidence['staleHours']).toBeNull();
    expect(freshness?.evidence['neverRefreshedWallets']).toBe(1);
  });

  it('judges a priority account on its stalest wallet, not its freshest', async () => {
    const response = await loadRows([
      stateRow({}),
      stateRow({
        wallet: '0x1b',
        last_portfolio_update_at: '2026-08-24T08:00:00.000Z',
      }),
    ]);

    const [user] = response.users;
    expect(user?.portfolioStaleHours).toBe(1);
    expect(user?.portfolioWorstStaleHours).toBeCloseTo(100, 5);

    const [, freshness] = deriveCustomerSignals(response, NOW);
    expect(freshness?.status).toBe('critical');
    expect(freshness?.evidence['aumAtRiskUsd']).toBe(50_000);
  });

  it('stays healthy when every wallet on the account is current', async () => {
    const response = await loadRows([
      stateRow({}),
      stateRow({
        wallet: '0x1b',
        last_portfolio_update_at: '2026-08-28T09:00:00.000Z',
      }),
    ]);

    const [, freshness] = deriveCustomerSignals(response, NOW);
    expect(freshness?.status).toBe('healthy');
    expect(response.users[0]?.neverRefreshedWallets).toBe(0);
  });

  it('sees a source that has never landed behind a fresh legacy timestamp', async () => {
    const response = await loadRows([
      stateRow({
        aum_usd: 500,
        source_states: sourceStates({
          debank: '2026-08-28T11:00:00.000Z',
          hyperliquid: null,
        }),
      }),
    ]);

    const [, freshness] = deriveCustomerSignals(response, NOW);
    expect(response.users[0]?.neverRefreshedWallets).toBe(1);
    expect(freshness?.status).toBe('degraded');
  });

  it('trusts the per-source readings over an ancient legacy timestamp', async () => {
    const response = await loadRows([
      stateRow({
        last_portfolio_update_at: '2026-01-01T00:00:00.000Z',
        source_states: sourceStates({
          debank: '2026-08-28T11:00:00.000Z',
          hyperliquid: '2026-08-28T10:00:00.000Z',
        }),
      }),
    ]);

    const [, freshness] = deriveCustomerSignals(response, NOW);
    expect(response.users[0]?.portfolioWorstStaleHours).toBe(2);
    expect(freshness?.status).toBe('healthy');
  });
});
