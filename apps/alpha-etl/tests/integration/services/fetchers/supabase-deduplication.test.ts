import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { SupabaseFetcher } from '../../../../src/modules/user-service/supabaseFetcher.js';
import { getDbPool } from '../../../../src/config/database.js';
import type { Pool } from 'pg';

/**
 * One wallet registered by two accounts must reach the ETL once, or the daily
 * batch pays a provider twice for the same address. The guarantee is split
 * across a SQL `distinct on (wallet)` and a TypeScript dedupe, so this asserts
 * both layers against the same function the job calls.
 */
describe('SupabaseFetcher - wallet deduplication (Integration)', () => {
  let fetcher: SupabaseFetcher;
  let pool: Pool;

  beforeAll(() => {
    pool = getDbPool();
    fetcher = new SupabaseFetcher();
  });

  afterAll(async () => {
    await pool.end();
  });

  const toCount = (value: string): number => parseInt(value, 10);

  it('should return unique wallets only (no duplicates)', async () => {
    const result = await fetcher.fetchUserServiceStates();

    const wallets = result.map((user) => user.wallet);
    const uniqueWallets = new Set(wallets);

    expect(uniqueWallets.size).toBe(wallets.length);
  });

  it('should match SQL function row count with unique wallet count', async () => {
    const { rows: sqlRows } = await pool.query<{
      total_rows: string;
      unique_wallets: string;
      duplicate_count: string;
    }>(`
      SELECT
        COUNT(*) as total_rows,
        COUNT(DISTINCT wallet) as unique_wallets,
        COUNT(*) - COUNT(DISTINCT wallet) as duplicate_count
      FROM public.get_user_service_states()
    `);

    const stats = sqlRows[0];
    const totalRows = toCount(stats.total_rows);
    const uniqueWallets = toCount(stats.unique_wallets);
    const duplicateCount = toCount(stats.duplicate_count);

    expect(duplicateCount).toBe(0);
    expect(totalRows).toBe(uniqueWallets);
  });

  it('should resolve a service policy for every returned wallet', async () => {
    const result = await fetcher.fetchUserServiceStates();

    expect(result.length).toBeGreaterThan(0);
    for (const user of result) {
      expect(user.userId).toBeDefined();
      expect(user.wallet).toBeDefined();
      expect(['priority', 'standard', 'paused']).toContain(user.effectiveTier);
      expect(typeof user.dueForRefresh).toBe('boolean');
    }
  });

  it('should reach the usage ledger through the definer function', async () => {
    // alpha_etl_user cannot touch ops.*; the write only works because it goes
    // through public.ops_record_user_resource_usage.
    await expect(
      fetcher.recordUserResourceUsage([
        {
          usage_date: '2026-08-28',
          user_id: '11111111-1111-1111-1111-111111111111',
          wallet: '0x1111111111111111111111111111111111111111',
          provider: 'debank',
          resource: 'portfolio_refresh',
          request_count: 2,
        },
      ]),
    ).resolves.toBeUndefined();
  });

  it('should keep free-plan wallets visible but unscheduled', async () => {
    // Standard users are returned on purpose: operations needs to see them,
    // and the refresh gate must still be the SQL function's answer.
    const result = await fetcher.fetchUserServiceStates();
    const standard = result.filter((user) => user.effectiveTier !== 'priority');

    for (const user of standard) {
      expect(user.dueForRefresh).toBe(false);
      expect(user.refreshIntervalHours).toBeNull();
    }
  });
});
