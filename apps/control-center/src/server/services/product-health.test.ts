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
  const queries = new Map<string, ReturnType<typeof query>[]>();
  return {
    from: vi.fn((table: string) => {
      const chain = query(
        queues[table]?.shift() ?? { data: [], count: 0, error: null },
      );
      const tableQueries = queries.get(table) ?? [];
      tableQueries.push(chain);
      queries.set(table, tableQueries);
      return chain;
    }),
    rpc: vi.fn().mockResolvedValue(input.rpc ?? { data: [], error: null }),
    queries,
  };
}

const config = readControlCenterConfig({
  SUPABASE_URL: 'https://db.example',
  SUPABASE_SERVICE_ROLE_KEY: 'service-key',
});
const now = new Date('2026-09-14T12:00:00.000Z');
const empty = {
  registeredUsers: null,
  verifiedWallets: null,
  portfolioUsers: null,
  wau: null,
  mau: null,
  observedPortfolioUsd: null,
  portfolioFresh24h: null,
  portfolioFresh7d: null,
  top1PortfolioShare: null,
  top3PortfolioShare: null,
  activePortfolios7d: null,
};

describe('loadProductHealth', () => {
  beforeEach(() => createServiceRoleClient.mockReset());

  it('returns an explicit unknown model when Supabase is not configured', async () => {
    await expect(
      loadProductHealth({ config: readControlCenterConfig({}), now }),
    ).resolves.toEqual(empty);
    expect(createServiceRoleClient).not.toHaveBeenCalled();
  });

  it('derives population, freshness, concentration and active-fresh users', async () => {
    const client = clientWith({
      users: [
        { count: 10, data: null, error: null },
        { count: 4, data: null, error: null },
        { count: 8, data: null, error: null },
      ],
      wallets: [{ count: 7, data: null, error: null }],
      portfolio: [
        {
          data: [
            {
              user_id: 'user-a',
              date: '2026-09-14T11:00:00.000Z',
              total_value_usd: '75',
            },
            {
              user_id: 'user-a',
              date: '2026-09-01T00:00:00.000Z',
              total_value_usd: 999,
            },
            {
              user_id: 'user-b',
              date: '2026-09-10T12:00:00.000Z',
              total_value_usd: 25,
            },
            { user_id: null, date: now.toISOString(), total_value_usd: 1 },
            { user_id: 'missing-date', date: null, total_value_usd: 1 },
            {
              user_id: 'bad-value',
              date: now.toISOString(),
              total_value_usd: 'not-a-number',
            },
            { user_id: 'bad-date', date: 'bad', total_value_usd: 1 },
          ],
          error: null,
        },
      ],
      rpc: {
        data: [
          {
            user_id: 'user-a',
            last_activity_at: '2026-09-14T10:00:00.000Z',
            source_states: {
              debank: { last_success_at: '2026-09-14T09:00:00.000Z' },
            },
          },
          {
            user_id: 'user-a',
            last_activity_at: '2026-09-14T10:00:00.000Z',
            source_states: {
              hyperliquid: { last_success_at: '2026-09-14T08:00:00.000Z' },
            },
          },
          {
            user_id: 'inactive',
            last_activity_at: '2026-08-01T00:00:00.000Z',
            last_portfolio_update_at: '2026-09-14T09:00:00.000Z',
          },
          {
            user_id: 'stale-wallet',
            last_activity_at: '2026-09-14T09:00:00.000Z',
            last_portfolio_update_at: '2026-08-01T00:00:00.000Z',
          },
          {
            user_id: 'missing-activity',
            last_activity_at: null,
            last_portfolio_update_at: '2026-09-14T09:00:00.000Z',
          },
          { user_id: null, last_activity_at: now.toISOString() },
        ],
        error: null,
      },
    });
    createServiceRoleClient.mockReturnValue(client);

    await expect(loadProductHealth({ config, now })).resolves.toEqual({
      registeredUsers: 10,
      verifiedWallets: 7,
      portfolioUsers: 2,
      wau: 4,
      mau: 8,
      observedPortfolioUsd: 100,
      portfolioFresh24h: 1,
      portfolioFresh7d: 2,
      top1PortfolioShare: 0.75,
      top3PortfolioShare: 1,
      activePortfolios7d: 1,
    });
    expect(client.rpc).toHaveBeenCalledWith('get_user_service_states');

    const userQueries = client.queries.get('users') ?? [];
    expect(userQueries[0]?.['select']).toHaveBeenCalledWith('*', {
      count: 'exact',
      head: true,
    });
    expect(userQueries[1]?.['gte']).toHaveBeenCalledWith(
      'last_activity_at',
      '2026-09-07T12:00:00.000Z',
    );
    expect(userQueries[2]?.['gte']).toHaveBeenCalledWith(
      'last_activity_at',
      '2026-08-15T12:00:00.000Z',
    );

    const walletQuery = client.queries.get('user_crypto_wallets')?.[0];
    expect(walletQuery?.['not']).toHaveBeenCalledWith(
      'ownership_verified_at',
      'is',
      null,
    );

    const portfolioQuery = client.queries.get(
      'portfolio_category_trend_mv',
    )?.[0];
    expect(portfolioQuery?.['not']?.mock.calls).toEqual([
      ['user_id', 'is', null],
      ['date', 'is', null],
      ['total_value_usd', 'is', null],
    ]);
    expect(portfolioQuery?.['order']).toHaveBeenCalledWith('date', {
      ascending: false,
    });
    expect(portfolioQuery?.['limit']).toHaveBeenCalledWith(2_000);
  });

  it('keeps zero-value portfolios distinct from an absent portfolio', async () => {
    const client = clientWith({
      users: [
        { count: 1, error: null },
        { count: 0, error: null },
        { count: 0, error: null },
      ],
      wallets: [{ count: 0, error: null }],
      portfolio: [
        {
          data: [
            {
              user_id: 'zero',
              date: now.toISOString(),
              total_value_usd: 0,
            },
          ],
          error: null,
        },
      ],
    });
    createServiceRoleClient.mockReturnValue(client);

    const result = await loadProductHealth({ config, now });
    expect(result.portfolioUsers).toBe(1);
    expect(result.observedPortfolioUsd).toBe(0);
    expect(result.top1PortfolioShare).toBeNull();
    expect(result.top3PortfolioShare).toBeNull();
  });

  it.each(['users', 'wallets', 'wau', 'mau', 'portfolio'] as const)(
    'fails closed when the %s read fails',
    async (failureAt) => {
      const failure = new Error(`${failureAt} failed`);
      const client = clientWith({
        users: [
          { count: 1, error: failureAt === 'users' ? failure : null },
          { count: 1, error: failureAt === 'wau' ? failure : null },
          { count: 1, error: failureAt === 'mau' ? failure : null },
        ],
        wallets: [
          { count: 1, error: failureAt === 'wallets' ? failure : null },
        ],
        portfolio: [
          { data: [], error: failureAt === 'portfolio' ? failure : null },
        ],
      });
      createServiceRoleClient.mockReturnValue(client);

      await expect(loadProductHealth({ config, now })).resolves.toEqual(empty);
    },
  );

  it('isolates the independently failing active-portfolio read', async () => {
    createServiceRoleClient.mockReturnValue(
      clientWith({
        users: [
          { count: 2, error: null },
          { count: 1, error: null },
          { count: 2, error: null },
        ],
        wallets: [{ count: 1, error: null }],
        portfolio: [{ data: [], error: null }],
        rpc: { data: null, error: new Error('RPC unavailable') },
      }),
    );

    const result = await loadProductHealth({ config, now });
    expect(result).toMatchObject({
      registeredUsers: 2,
      portfolioUsers: 0,
      observedPortfolioUsd: null,
      activePortfolios7d: null,
    });
  });

  it('fails closed when query construction throws', async () => {
    createServiceRoleClient.mockReturnValue({
      from: vi.fn(() => {
        throw new Error('client exploded');
      }),
    });

    await expect(loadProductHealth({ config, now })).resolves.toEqual(empty);
  });
});
