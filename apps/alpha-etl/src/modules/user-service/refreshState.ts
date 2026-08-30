import { writeBookkeepingNonFatal } from './bookkeeping.js';
import type { SupabaseFetcher } from './supabaseFetcher.js';

/**
 * The providers that refresh a wallet's portfolio slice, each scheduled on its
 * own freshness state. Mirrors the check constraint on
 * `ops.wallet_source_refresh_state`, which rejects anything else.
 */
export type PortfolioSource = 'debank' | 'hyperliquid';

/**
 * One line of per-(wallet, source) refresh state.
 *
 * Snake_case on purpose: these objects are serialized straight into
 * `public.ops_record_wallet_source_refresh(jsonb)`, whose `jsonb_to_recordset`
 * matches column names literally, so a camelCase key would be silently read as
 * null rather than rejected.
 */
export interface WalletSourceRefreshRow {
  wallet: string;
  source: PortfolioSource;
  user_id: string | null;
  succeeded: boolean;
  error?: string;
}

/**
 * What one wallet's provider call produced, as the fetching stage saw it.
 * Failed wallets belong here too: a provider that could not be reached is the
 * reason the wallet must stay due.
 */
export interface WalletRefreshOutcome {
  wallet: string;
  userId: string;
  fetchSucceeded: boolean;
  error?: string;
}

/**
 * Turn one batch's per-wallet outcomes into the state rows for a source.
 *
 * A wallet whose data was fetched but never written is not refreshed, so a
 * failed load marks every fetched wallet as failed. That leaves them due and
 * the next run over-refreshes, which costs one extra provider call; the other
 * direction marks them fresh on data that never landed and loses a day.
 */
export function buildSourceRefreshRecords(
  source: PortfolioSource,
  outcomes: WalletRefreshOutcome[],
  load: { succeeded: boolean; error?: string },
): WalletSourceRefreshRow[] {
  return outcomes.map((outcome) => {
    // The fetch failure is the more specific explanation; the load error only
    // describes wallets that got that far.
    const error = outcome.fetchSucceeded ? load.error : outcome.error;

    return {
      wallet: outcome.wallet,
      source,
      user_id: outcome.userId,
      succeeded: outcome.fetchSucceeded && load.succeeded,
      ...(error !== undefined && { error }),
    };
  });
}

export async function recordSourceRefreshOutcomeNonFatal(
  fetcher: SupabaseFetcher,
  rows: WalletSourceRefreshRow[],
  jobId: string,
): Promise<void> {
  await writeBookkeepingNonFatal({
    rows,
    write: () => fetcher.recordWalletSourceRefresh(rows),
    failureMessage: 'Failed to record wallet source refresh state',
    jobId,
  });
}
