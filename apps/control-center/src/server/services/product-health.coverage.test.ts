import { beforeEach, describe, expect, it, vi } from 'vitest';

const createServiceRoleClient = vi.hoisted(() => vi.fn());
vi.mock('./supabase.js', () => ({ createServiceRoleClient }));

import { readControlCenterConfig } from '../config/env.js';
import { loadProductHealth } from './product-health.js';

type Result = { count?: number | null; data?: unknown; error?: unknown };

function query(result: Result) {
  const chain: Record<string, ReturnType<typeof vi.fn>> & {
    then?: Promise<Result>['then'];
  } = {};
  for (const method of ['select', 'not', 'gte', 'order', 'limit']) {
    chain[method] = vi.fn(() => chain);
  }
  chain.then = (resolve, reject) =>
    Promise.resolve(result).then(resolve, reject);
  return chain;
}

function clientWith(input: {
  users?: Result[];
  wallets?: Result[];
  portfolio?: Result[];
  rpc?: Result;
}) {
  const queues: Record<string, Result[]> = {
    users: [...(input.users ?? [])],
    user_crypto_wallets: [...(input.wallets ?? [])],
    portfolio_category_trend_mv: [...(input.portfolio ?? [])],
  };
  return {
    from: vi.fn((table: string) => {
      const next = queues[table]?.shift() ?? {
        data: [],
        count: 0,
        error: null,
      };
      return query(next);
    }),
    rpc: vi.fn().mockResolvedValue(input.rpc ?? { data: [], error: null }),
  };
}

const config = readControlCenterConfig({
  SUPABASE_URL: 'https://db.example',
  SUPABASE_SERVICE_ROLE_KEY: 'service-key',
});
const NOW = new Date('2026-09-14T12:00:00.000Z');

function healthyClient(portfolioData: unknown, rpcData: unknown = []) {
  return clientWith({
    users: [
      { count: 10, error: null },
      { count: 5, error: null },
      { count: 3, error: null },
    ],
    wallets: [{ count: 4, error: null }],
    portfolio: [{ data: portfolioData, error: null }],
    rpc: { data: rpcData, error: null },
  });
}

describe('product health coverage gaps', () => {
  beforeEach(() => createServiceRoleClient.mockReset());

  it('defaults now when omitted', async () => {
    const client = healthyClient([]);
    createServiceRoleClient.mockReturnValue(client);

    const result = await loadProductHealth({ config });
    expect(result.registeredUsers).toBe(10);
    expect(result.portfolioUsers).toBe(0);
    expect(createServiceRoleClient).toHaveBeenCalled();
  });

  it('treats a null portfolio payload as an empty ledger', async () => {
    const client = healthyClient(null);
    createServiceRoleClient.mockReturnValue(client);

    const result = await loadProductHealth({ config, now: NOW });
    expect(result.portfolioUsers).toBe(0);
    expect(result.observedPortfolioUsd).toBeNull();
    expect(result.top1PortfolioShare).toBeNull();
  });

  it('treats a null activity payload as zero active portfolios', async () => {
    const client = healthyClient([], null);
    createServiceRoleClient.mockReturnValue(client);

    const result = await loadProductHealth({ config, now: NOW });
    expect(result.activePortfolios7d).toBe(0);
  });
});
