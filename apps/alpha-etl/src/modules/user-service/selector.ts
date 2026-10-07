import type { ETLUserCandidate } from '../../types/index.js';
import { logger } from '../../utils/logger.js';
import type { PortfolioSource } from './refreshState.js';
import type { SupabaseFetcher } from './supabaseFetcher.js';

type SelectionLogger = Pick<typeof logger, 'info' | 'warn'>;

export interface DueUserSelection {
  usersToUpdate: ETLUserCandidate[];
  candidatesTotal: number;
  skippedNotDue: number;
  skippedByTier: number;
}

/**
 * Project `public.get_user_service_states()` onto the wallets a provider batch
 * should actually call today.
 *
 * The two conditions below are a projection of the function's answer, not a
 * second implementation of it: cadence, operator overrides and the refresh
 * fence all live in SQL because the Control Center reports from the same rows.
 * Re-deriving "due" here from `lastPortfolioUpdateAt` is what would let the
 * dashboard say Standard while this job kept paying DeBank for Priority.
 *
 * Dueness is now answered per provider, and `dueSources` is that answer: one
 * wallet timestamp could not say that DeBank landed today and Hyperliquid did
 * not, so DeBank running first in the same daily job declared the wallet fresh
 * and Hyperliquid was skipped every day. Membership in `dueSources` is the
 * whole filter — do not reconstruct it here from the per-source state.
 *
 * Cadence, rather than commercial tier, defines the refresh obligation:
 * inactive standard accounts now have a weekly interval too. Paused overrides
 * always win, even if a malformed response includes due sources.
 */
export async function selectDueUsers(input: {
  fetcher: SupabaseFetcher;
  source: PortfolioSource;
  jobId: string;
  log?: SelectionLogger;
}): Promise<DueUserSelection> {
  const { fetcher, source, jobId, log = logger } = input;

  const candidates = await fetcher.fetchUserServiceStates();
  const scheduled = candidates.filter(
    (candidate) =>
      candidate.effectiveTier !== 'paused' &&
      candidate.refreshIntervalHours !== null &&
      candidate.refreshIntervalHours > 0,
  );
  const usersToUpdate = scheduled.filter((candidate) =>
    candidate.dueSources.includes(source),
  );

  const counts = {
    jobId,
    source,
    candidatesTotal: candidates.length,
    usersToUpdate: usersToUpdate.length,
    skippedNotDue: scheduled.length - usersToUpdate.length,
    skippedByTier: candidates.length - scheduled.length,
  };

  if (usersToUpdate.length === 0) {
    log.warn('No wallets due for refresh', counts);
  } else {
    log.info('Wallets selected for refresh', counts);
  }

  return {
    usersToUpdate,
    candidatesTotal: counts.candidatesTotal,
    skippedNotDue: counts.skippedNotDue,
    skippedByTier: counts.skippedByTier,
  };
}

/**
 * Stamp the DeBank display aggregate on `user_crypto_wallets`.
 *
 * Call this only once the load has committed. It used to run right after the
 * fetch returned, so a batch that fetched cleanly and then failed to write
 * still looked refreshed.
 */
export async function updatePortfolioTimestampsNonFatal(
  supabaseFetcher: SupabaseFetcher,
  wallets: string[],
  jobId: string,
): Promise<void> {
  if (wallets.length === 0) {
    return;
  }

  try {
    await supabaseFetcher.batchUpdatePortfolioTimestamps(wallets);
    logger.info('Portfolio timestamps updated', {
      jobId,
      walletsUpdated: wallets.length,
    });
  } catch (error) {
    logger.error('Failed to batch update portfolio timestamps', {
      jobId,
      walletsCount: wallets.length,
      error,
    });
  }
}
