import { beforeEach, describe, expect, it, vi } from 'vitest';

const createServiceRoleClient = vi.hoisted(() => vi.fn());

vi.mock('./supabase.js', () => ({ createServiceRoleClient }));

import type { CostSnapshot } from '@zapengine/cost-observability';

import { readControlCenterConfig } from '../config/env.js';
import { ledgerRow } from './__fixtures__/cost.js';
import { createCostRepository } from './cost-repository.js';

type DbResult = { data?: unknown; error?: unknown };

function query(result: DbResult) {
  const chain: Record<string, ReturnType<typeof vi.fn>> & {
    then?: Promise<DbResult>['then'];
  } = {};
  for (const method of ['select', 'order', 'limit', 'gte', 'lt']) {
    chain[method] = vi.fn(() => chain);
  }
  chain.then = (resolve, reject) =>
    Promise.resolve(result).then(resolve, reject);
  return chain;
}

function clientWith(input: {
  tables?: Record<string, DbResult[]>;
  rpc?: DbResult[];
}) {
  const queues = new Map(
    Object.entries(input.tables ?? {}).map(([table, results]) => [
      table,
      [...results],
    ]),
  );
  const rpcResults = [...(input.rpc ?? [])];
  const queries = new Map<string, ReturnType<typeof query>[]>();
  return {
    from: vi.fn((table: string) => {
      const chain = query(
        queues.get(table)?.shift() ?? { data: [], error: null },
      );
      const tableQueries = queries.get(table) ?? [];
      tableQueries.push(chain);
      queries.set(table, tableQueries);
      return chain;
    }),
    rpc: vi.fn(async () => rpcResults.shift() ?? { data: null, error: null }),
    queries,
  };
}

const config = readControlCenterConfig({
  SUPABASE_URL: 'https://db.example',
  SUPABASE_SERVICE_ROLE_KEY: 'service-key',
  SUPABASE_DB_SCHEMA: 'ops',
});

const snapshot: CostSnapshot = {
  provider: 'openrouter',
  periodStart: '2026-09-01T00:00:00.000Z',
  periodEnd: '2026-09-03T00:00:00.000Z',
  accruedCostUsd: 2,
  projectedCostUsd: 20,
  costType: 'actual',
  source: 'api',
  usage: [{ key: 'tokens', label: 'Tokens', unit: 'units', value: 12 }],
  fetchedAt: '2026-09-03T01:02:03.000Z',
};

describe('createCostRepository', () => {
  beforeEach(() => {
    createServiceRoleClient.mockReset();
  });

  it('returns null unless both service-role credentials exist', () => {
    expect(createCostRepository(readControlCenterConfig({}))).toBeNull();
    expect(
      createCostRepository(
        readControlCenterConfig({ SUPABASE_URL: 'https://db.example' }),
      ),
    ).toBeNull();
    expect(
      createCostRepository(
        readControlCenterConfig({ SUPABASE_SERVICE_ROLE_KEY: 'key' }),
      ),
    ).toBeNull();
    expect(createServiceRoleClient).not.toHaveBeenCalled();
  });

  it('maps pricing rows and treats a null payload as an empty ledger', async () => {
    const client = clientWith({
      tables: {
        ops_cost_rates: [
          {
            data: [
              {
                id: 'rate-1',
                provider: 'openrouter',
                metric_key: 'tokens',
                unit: 'token',
                price_usd: '0.000002',
                effective_from: '2026-09-01',
                effective_to: null,
              },
            ],
            error: null,
          },
          { data: null, error: null },
        ],
      },
    });
    createServiceRoleClient.mockReturnValue(client);
    const repository = createCostRepository(config)!;

    await expect(repository.loadPricingRates()).resolves.toEqual([
      {
        id: 'rate-1',
        provider: 'openrouter',
        metricKey: 'tokens',
        unit: 'token',
        priceUsd: 0.000002,
        effectiveFrom: '2026-09-01',
        effectiveTo: null,
      },
    ]);
    await expect(repository.loadPricingRates()).resolves.toEqual([]);
    expect(createServiceRoleClient).toHaveBeenCalledWith(
      'https://db.example',
      'service-key',
      'ops',
    );
  });

  it('propagates a pricing read failure', async () => {
    const failure = { code: 'XX000' };
    createServiceRoleClient.mockReturnValue(
      clientWith({
        tables: { ops_cost_rates: [{ data: null, error: failure }] },
      }),
    );
    const repository = createCostRepository(config)!;

    await expect(repository.loadPricingRates()).rejects.toBe(failure);
  });

  it('writes a normalized cost snapshot and propagates RPC errors', async () => {
    const failure = new Error('write failed');
    const client = clientWith({
      rpc: [
        { data: null, error: null },
        { data: null, error: failure },
      ],
    });
    createServiceRoleClient.mockReturnValue(client);
    const repository = createCostRepository(config)!;

    await expect(
      repository.upsertSnapshot(snapshot, 'rate-1'),
    ).resolves.toBeUndefined();
    expect(client.rpc).toHaveBeenNthCalledWith(1, 'ops_upsert_cost_snapshot', {
      p_provider: 'openrouter',
      p_snapshot_date: '2026-09-03',
      p_period_start: snapshot.periodStart,
      p_period_end: snapshot.periodEnd,
      p_accrued_cost_usd: 2,
      p_projected_cost_usd: 20,
      p_cost_type: 'actual',
      p_source: 'api',
      p_usage: snapshot.usage,
      p_pricing_rate_id: 'rate-1',
      p_fetched_at: snapshot.fetchedAt,
      p_updated_at: expect.any(String),
    });
    await expect(repository.upsertSnapshot(snapshot, null)).rejects.toBe(
      failure,
    );
  });

  it('loads current provider cards from newest-first snapshot rows', async () => {
    const row = ledgerRow({
      snapshot_date: '2026-09-03',
      period_start: '2026-09-01T00:00:00.000Z',
      fetched_at: '2026-09-03T01:00:00.000Z',
    });
    const client = clientWith({
      tables: {
        ops_cost_snapshots: [
          { data: [row], error: null },
          { data: null, error: null },
        ],
      },
    });
    createServiceRoleClient.mockReturnValue(client);
    const repository = createCostRepository(config)!;
    const now = new Date('2026-09-03T12:00:00.000Z');

    const providers = await repository.loadLatestProviders(now);
    expect(
      providers.find((entry) => entry.provider === 'openrouter'),
    ).toMatchObject({
      status: 'ok',
      snapshot: { accruedCostUsd: 0.12 },
    });
    expect(providers).toHaveLength(6);
    const firstQuery = client.queries.get('ops_cost_snapshots')?.[0];
    expect(firstQuery?.['order']).toHaveBeenNthCalledWith(1, 'snapshot_date', {
      ascending: false,
    });
    expect(firstQuery?.['order']).toHaveBeenNthCalledWith(2, 'fetched_at', {
      ascending: false,
    });
    expect(firstQuery?.['limit']).toHaveBeenCalledWith(120);
    await expect(repository.loadLatestProviders(now)).resolves.toHaveLength(6);
  });

  it('propagates a current-provider read error', async () => {
    const failure = new Error('snapshot read failed');
    createServiceRoleClient.mockReturnValue(
      clientWith({
        tables: {
          ops_cost_snapshots: [{ data: null, error: failure }],
        },
      }),
    );
    await expect(
      createCostRepository(config)!.loadLatestProviders(new Date()),
    ).rejects.toBe(failure);
  });

  it('loads daily, monthly, cash and previous-month history in one bounded read', async () => {
    const rows = [
      ledgerRow({
        snapshot_date: '2026-08-31',
        period_start: '2026-08-01T00:00:00.000Z',
      }),
      ledgerRow({
        provider: 'fly',
        snapshot_date: '2026-09-02',
        period_start: '2026-09-01T00:00:00.000Z',
        accrued_cost_usd: '3.5',
        projected_cost_usd: '4',
      }),
    ];
    const client = clientWith({
      tables: {
        ops_cost_snapshots: [{ data: rows, error: null }],
        ops_cost_transactions: [
          {
            data: [
              { amount_usd: '1.25', charged_at: '2026-09-02T00:00:00Z' },
              { amount_usd: 2, charged_at: '2026-09-03T00:00:00Z' },
            ],
            error: null,
          },
        ],
      },
    });
    createServiceRoleClient.mockReturnValue(client);

    const history = await createCostRepository(config)!.loadHistory(
      new Date('2026-09-15T12:00:00.000Z'),
    );
    expect(history.currentMonthDaily).toHaveLength(1);
    expect(history.monthlyTotals).toHaveLength(2);
    expect(history.cashSpendUsd).toBe(3.25);
    expect(history.previousMonthByProvider).toEqual([
      { provider: 'debank', accruedCostUsd: null },
      { provider: 'openrouter', accruedCostUsd: 0.12 },
      { provider: 'brave', accruedCostUsd: null },
      { provider: 'cloudflare', accruedCostUsd: null },
      { provider: 'supabase', accruedCostUsd: null },
      { provider: 'fly', accruedCostUsd: null },
    ]);

    const snapshotQuery = client.queries.get('ops_cost_snapshots')?.[0];
    expect(snapshotQuery?.['gte']).toHaveBeenCalledWith(
      'snapshot_date',
      '2025-10-01',
    );
    expect(snapshotQuery?.['lt']).toHaveBeenCalledWith(
      'snapshot_date',
      '2026-10-01',
    );
    expect(snapshotQuery?.['order']).toHaveBeenCalledWith('snapshot_date', {
      ascending: true,
    });

    const transactionQuery = client.queries.get('ops_cost_transactions')?.[0];
    expect(transactionQuery?.['gte']).toHaveBeenCalledWith(
      'charged_at',
      '2026-09-01T00:00:00.000Z',
    );
    expect(transactionQuery?.['lt']).toHaveBeenCalledWith(
      'charged_at',
      '2026-10-01T00:00:00.000Z',
    );
  });

  it.each(['snapshots', 'transactions'] as const)(
    'propagates a %s history read error',
    async (failedRead) => {
      const failure = new Error(`${failedRead} failed`);
      createServiceRoleClient.mockReturnValue(
        clientWith({
          tables: {
            ops_cost_snapshots: [
              {
                data: [],
                error: failedRead === 'snapshots' ? failure : null,
              },
            ],
            ops_cost_transactions: [
              {
                data: [],
                error: failedRead === 'transactions' ? failure : null,
              },
            ],
          },
        }),
      );

      await expect(
        createCostRepository(config)!.loadHistory(new Date()),
      ).rejects.toBe(failure);
    },
  );

  it('inserts transactions with explicit and defaulted optional fields', async () => {
    const failure = new Error('transaction failed');
    const client = clientWith({
      rpc: [
        { data: null, error: null },
        { data: null, error: failure },
      ],
    });
    createServiceRoleClient.mockReturnValue(client);
    const repository = createCostRepository(config)!;

    await repository.insertTransaction({
      provider: 'fly',
      amountUsd: 12.5,
      chargedAt: '2026-09-10T00:00:00Z',
      kind: 'invoice',
      source: 'fly-dashboard',
    });
    expect(client.rpc).toHaveBeenNthCalledWith(
      1,
      'ops_insert_cost_transaction',
      {
        p_provider: 'fly',
        p_amount_usd: 12.5,
        p_charged_at: '2026-09-10T00:00:00Z',
        p_kind: 'invoice',
        p_source: 'fly-dashboard',
        p_external_id: null,
        p_description: null,
      },
    );

    await expect(
      repository.insertTransaction({
        provider: 'openrouter',
        amountUsd: 1,
        chargedAt: '2026-09-10T00:00:00Z',
        kind: 'adjustment',
        source: 'manual',
        externalId: 'charge-1',
        description: 'credit correction',
      }),
    ).rejects.toBe(failure);
  });

  it('turns a recorded bill into a month-to-date estimated snapshot', async () => {
    const client = clientWith({});
    createServiceRoleClient.mockReturnValue(client);
    const repository = createCostRepository(config)!;
    const upsert = vi
      .spyOn(repository, 'upsertSnapshot')
      .mockResolvedValue(undefined);
    const now = new Date('2026-09-14T12:30:00.000Z');

    await repository.upsertRecordedSnapshot({
      provider: 'fly',
      amountUsd: 14.02,
      source: 'manual',
      now,
      usage: [{ key: 'machines', label: 'Machines', unit: 'units', value: 3 }],
    });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'fly',
        periodStart: '2026-09-01T00:00:00.000Z',
        periodEnd: now.toISOString(),
        accruedCostUsd: 14.02,
        projectedCostUsd: 14.02,
        usage: [
          { key: 'machines', label: 'Machines', unit: 'units', value: 3 },
        ],
        costType: 'estimated',
      }),
      null,
    );

    await repository.upsertRecordedSnapshot({
      provider: 'fly',
      amountUsd: 1,
      source: 'manual',
      now,
    });
    expect(upsert).toHaveBeenLastCalledWith(
      expect.objectContaining({ usage: [] }),
      null,
    );
  });
});
