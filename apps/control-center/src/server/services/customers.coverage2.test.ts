import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { readControlCenterConfig } from '../config/env.js';
import { deriveCustomerSignals, loadCustomerEconomics } from './customers.js';

afterEach(() => vi.unstubAllGlobals());

const NOW = new Date('2026-08-28T12:00:00.000Z');
const CONFIGURED = readControlCenterConfig({
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
});

interface QueryResult {
  data: unknown;
  error: unknown;
}

function tableStub(result: QueryResult) {
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'order']) {
    chain[m] = () => chain;
  }
  chain['gte'] = () => Promise.resolve(result);
  chain['limit'] = () => Promise.resolve(result);
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

function stateRow(overrides: Record<string, unknown> = {}) {
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

describe('customers coverage round 2', () => {
  it('treats a null usage payload as an empty ledger', async () => {
    const res = await loadCustomerEconomics({
      config: CONFIGURED,
      now: NOW,
      createSupabaseClient: factory({
        policy: { data: [stateRow({})], error: null },
        usage: { data: null, error: null },
      }),
    });
    expect(res.status).toBe('ok');
    expect(res.users[0]?.requestCount30d).toBe(0);
    expect(res.users[0]?.attributedCostUsd30d).toBeNull();
  });

  it('treats a null cost payload as no invoice yet', async () => {
    const res = await loadCustomerEconomics({
      config: CONFIGURED,
      now: NOW,
      createSupabaseClient: factory({
        policy: { data: [stateRow({})], error: null },
        usage: {
          data: [{ user_id: 'user-1', provider: 'debank', request_count: 10 }],
          error: null,
        },
        cost: { data: null, error: null },
      }),
    });
    expect(res.status).toBe('ok');
    expect(res.users[0]?.attributedCostUsd30d).toBeNull();
    expect(res.users[0]?.costBasis).toBeNull();
  });

  it('treats a null policy payload as an empty customer list', async () => {
    const res = await loadCustomerEconomics({
      config: CONFIGURED,
      now: NOW,
      createSupabaseClient: factory({
        policy: { data: null, error: null },
      }),
    });
    expect(res.status).toBe('ok');
    expect(res.users).toEqual([]);
    expect(res.summary.totalCustomers).toBe(0);
  });

  it('falls back to the generic message when an error carries none', async () => {
    const [signal] = deriveCustomerSignals(
      {
        generatedAt: NOW.toISOString(),
        status: 'error',
        message: null,
        summary: {
          totalCustomers: 0,
          priorityUsers: 0,
          standardUsers: 0,
          pausedUsers: 0,
          activeLast7d: 0,
          inactiveButPriority: 0,
          aumUsd: null,
          attributedCostUsd30d: null,
          revenueUsd: null,
        },
        users: [],
      },
      NOW,
    );
    expect(signal?.status).toBe('degraded');
    expect(signal?.title).toContain('customer-economics');
    expect(signal?.detail).toContain('Customer query failed');
  });

  it('sorts stale portfolios with missing AUM as zero', async () => {
    const res = await loadCustomerEconomics({
      config: CONFIGURED,
      now: NOW,
      createSupabaseClient: factory({
        policy: {
          data: [
            stateRow({
              user_id: 'no-aum-a',
              email: 'a@x.com',
              wallet: '0xa',
              aum_usd: null,
              last_portfolio_update_at: '2026-08-20T00:00:00Z',
            }),
            stateRow({
              user_id: 'no-aum-b',
              email: 'b@x.com',
              wallet: '0xb',
              aum_usd: null,
              last_portfolio_update_at: '2026-08-20T00:00:00Z',
            }),
          ],
          error: null,
        },
      }),
    });
    const [signal] = deriveCustomerSignals(res, NOW);
    expect(signal?.status).toBe('degraded');
    expect(signal?.evidence['affectedUsers']).toBe(2);
  });

  it('identifies the worst account by user id when email is missing', async () => {
    const res = await loadCustomerEconomics({
      config: CONFIGURED,
      now: NOW,
      createSupabaseClient: factory({
        policy: {
          data: [
            stateRow({
              email: null,
              aum_usd: 60_000,
              last_portfolio_update_at: '2026-08-20T00:00:00Z',
            }),
          ],
          error: null,
        },
      }),
    });
    const [signal] = deriveCustomerSignals(res, NOW);
    expect(signal?.status).toBe('critical');
    expect(signal?.detail).toContain('user-1');
    expect(signal?.evidence['topUser']).toBe('user-1');
  });

  it('pluralizes the never-refreshed wallet count', async () => {
    const res = await loadCustomerEconomics({
      config: CONFIGURED,
      now: NOW,
      createSupabaseClient: factory({
        policy: {
          data: [
            stateRow({ wallet: '0x1a', last_portfolio_update_at: null }),
            stateRow({ wallet: '0x1b', last_portfolio_update_at: null }),
          ],
          error: null,
        },
      }),
    });
    const [signal] = deriveCustomerSignals(res, NOW);
    expect(res.users[0]?.neverRefreshedWallets).toBe(2);
    expect(signal?.detail).toContain('2 wallets that never refreshed');
  });

  it('labels a missing plan code as unknown', async () => {
    const res = await loadCustomerEconomics({
      config: CONFIGURED,
      now: NOW,
      createSupabaseClient: factory({
        policy: { data: [stateRow({ plan_code: null })], error: null },
      }),
    });
    expect(res.users[0]?.planCode).toBe('unknown');
  });

  it('uses the default client when no factory is provided', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json([])),
    );
    const res = await loadCustomerEconomics({
      config: CONFIGURED,
      now: NOW,
    });
    expect(res.status).toBe('ok');
    expect(res.users).toEqual([]);
  });
});
