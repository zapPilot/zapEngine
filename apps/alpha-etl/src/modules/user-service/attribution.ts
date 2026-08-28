import type { ETLUserCandidate } from '../../types/index.js';
import { writeBookkeepingNonFatal } from './bookkeeping.js';
import type { SupabaseFetcher } from './supabaseFetcher.js';

/**
 * One line of the per-user usage ledger.
 *
 * Snake_case on purpose: these objects are serialized straight into
 * `public.ops_record_user_resource_usage(jsonb)`, whose `jsonb_to_recordset`
 * matches column names literally, so a camelCase key would be silently read as
 * null rather than rejected.
 */
export interface UserResourceUsageRow {
  usage_date: string;
  user_id: string;
  wallet: string;
  provider: 'debank' | 'hyperliquid';
  resource: string;
  request_count: number;
}

interface ResourceUsage {
  provider: UserResourceUsageRow['provider'];
  resource: string;
  requestCount: number;
}

/**
 * Build one ledger line per wallet the batch actually fetched.
 *
 * Failed wallets are excluded because the ledger answers "what did serving
 * this user cost", and the daily job re-runs after a partial failure: counting
 * an attempt that produced no data would inflate exactly the accounts a
 * provider outage already hurt.
 *
 * The date comes from the UTC calendar day so a line lands on the same day as
 * the `analytics.daily_*` slice the calls produced.
 */
export function buildUserResourceUsageRows(
  users: ETLUserCandidate[],
  successfulWallets: string[],
  usage: ResourceUsage,
): UserResourceUsageRow[] {
  const succeeded = new Set(successfulWallets);
  const usageDate = new Date().toISOString().slice(0, 10);

  return users
    .filter((user) => succeeded.has(user.wallet))
    .map((user) => ({
      usage_date: usageDate,
      user_id: user.userId,
      wallet: user.wallet,
      provider: usage.provider,
      resource: usage.resource,
      request_count: usage.requestCount,
    }));
}

export async function recordUserResourceUsageNonFatal(
  fetcher: SupabaseFetcher,
  rows: UserResourceUsageRow[],
  jobId: string,
): Promise<void> {
  await writeBookkeepingNonFatal({
    rows,
    write: () => fetcher.recordUserResourceUsage(rows),
    failureMessage: 'Failed to record per-user resource usage',
    jobId,
  });
}
