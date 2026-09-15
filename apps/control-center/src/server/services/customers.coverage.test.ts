import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import { readControlCenterConfig } from '../config/env.js';
import {
  deriveCustomerSignals,
  loadCustomerEconomics,
} from './customers.js';

const NOW = new Date('2026-08-28T12:00:00.000Z');
const CONFIGURED = readControlCenterConfig({
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
});

interface QueryResult { data: unknown; error: unknown; }

function tableStub(result: QueryResult) {
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'order']) chain[m] = () => chain;
  chain['gte'] = () => Promise.resolve(result);
  chain['limit'] = () => Promise.resolve(result);
  return chain;
}

function factory(input: { policy: QueryResult; usage?: QueryResult; cost?: QueryResult }) {
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

describe('customers coverage', () => {
  it('skips rows without user id or wallet and sorts by AUM', async () => {
    const res = await loadCustomerEconomics({
      config: CONFIGURED,
      now: NOW,
      createSupabaseClient: factory({
        policy: {
          data: [
            { user_id: '', wallet: '0x0' },
            { user_id: 'u1', wallet: '' },
            stateRow({ user_id: 'low', email: 'l@x.com', wallet: '0xl', aum_usd: 1 }),
            stateRow({ user_id: 'high', email: 'h@x.com', wallet: '0xh', aum_usd: 999 }),
          ],
          error: null,
        },
      }),
    });
    expect(res.status).toBe('ok');
    expect(res.users.map((u) => u.userId)).toEqual(['high', 'low']);
  });

  it('drops corrupt AUM and non-positive usage rows from allocation', async () => {
    const res = await loadCustomerEconomics({
      config: CONFIGURED,
      now: NOW,
      createSupabaseClient: factory({
        policy: { data: [stateRow({ aum_usd: -5 })], error: null },
        usage: {
          data: [
            { user_id: 'user-1', provider: 'debank', request_count: 0 },
            { user_id: null, provider: 'debank', request_count: 10 },
            { user_id: 'user-1', provider: 'debank', request_count: 'bogus' },
          ],
          error: null,
        },
        cost: { data: [{ accrued_cost_usd: 100, projected_cost_usd: 100 }], error: null },
      }),
    });
    expect(res.users[0]?.aumUsd).toBeNull();
    expect(res.users[0]?.attributedCostUsd30d).toBeNull();
  });

  it('reports a critical freshness signal sorted by AUM with never-refreshed worst', async () => {
    const res = await loadCustomerEconomics({
      config: CONFIGURED,
      now: NOW,
      createSupabaseClient: factory({
        policy: {
          data: [
            stateRow({ user_id: 'rich', email: 'r@x.com', wallet: '0xr', aum_usd: 50000, last_portfolio_update_at: null }),
            stateRow({ user_id: 'poor', email: 'p@x.com', wallet: '0xp', aum_usd: 1000, last_portfolio_update_at: '2026-08-20T00:00:00Z' }),
          ],
          error: null,
        },
      }),
    });
    const [signal] = deriveCustomerSignals(res, NOW);
    expect(signal?.status).toBe('critical');
    expect(signal?.title).toContain('2 priority portfolios');
    expect(signal?.detail).toContain('never refreshed');
  });

  it('reports a degraded signal under the AUM floor and healthy when current', async () => {
    const small = await loadCustomerEconomics({
      config: CONFIGURED,
      now: NOW,
      createSupabaseClient: factory({
        policy: {
          data: [stateRow({ aum_usd: 100, last_portfolio_update_at: '2026-08-20T00:00:00Z' })],
          error: null,
        },
      }),
    });
    expect(deriveCustomerSignals(small, NOW)[0]?.status).toBe('degraded');
    const fresh = await loadCustomerEconomics({
      config: CONFIGURED,
      now: NOW,
      createSupabaseClient: factory({ policy: { data: [stateRow({})], error: null } }),
    });
    expect(deriveCustomerSignals(fresh, NOW)[0]?.status).toBe('healthy');
  });

  it('describes the worst account by age when everything refreshed', async () => {
    const res = await loadCustomerEconomics({
      config: CONFIGURED,
      now: NOW,
      createSupabaseClient: factory({
        policy: {
          data: [stateRow({ last_portfolio_update_at: '2026-08-25T12:00:00Z' })],
          error: null,
        },
      }),
    });
    const [signal] = deriveCustomerSignals(res, NOW);
    expect(signal?.detail).toMatch(/at \d+h/);
  });

  it('maps policy failure and unconfigured to error/unknown signals', async () => {
    const failed = await loadCustomerEconomics({
      config: CONFIGURED,
      now: NOW,
      createSupabaseClient: factory({
        policy: { data: null, error: { message: 'policy down' } },
      }),
    });
    expect(failed.status).toBe('error');
    expect(deriveCustomerSignals(failed, NOW)[0]?.status).toBe('degraded');
    const unconfigured = await loadCustomerEconomics({
      config: readControlCenterConfig({}),
      now: NOW,
    });
    expect(deriveCustomerSignals(unconfigured, NOW)[0]?.status).toBe('unknown');
  });

  it('treats a failing usage ledger as unavailable message but still ok', async () => {
    const res = await loadCustomerEconomics({
      config: CONFIGURED,
      now: NOW,
      createSupabaseClient: factory({
        policy: { data: [stateRow({})], error: null },
        usage: { data: null, error: { message: 'usage down' } },
        cost: { data: null, error: { message: 'cost down' } },
      }),
    });
    expect(res.status).toBe('ok');
    expect(res.message).toBe('Usage ledger unavailable');
  });
});
