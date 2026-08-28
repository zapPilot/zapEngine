import type { ETLUserCandidate } from '../../types/index.js';
import { logger } from '../../utils/logger.js';
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
 * A standard or paused wallet already arrives with `dueForRefresh: false`, so
 * the tier check adds no filtering; it splits the skips into two counts, which
 * is what tells an operator whether a batch that fell to zero wallets was
 * paused by an override or simply refreshed an hour ago.
 */
export async function selectDueUsers(input: {
  fetcher: SupabaseFetcher;
  source: string;
  jobId: string;
  log?: SelectionLogger;
}): Promise<DueUserSelection> {
  const { fetcher, source, jobId, log = logger } = input;

  const candidates = await fetcher.fetchUserServiceStates();
  const priority = candidates.filter(
    (candidate) => candidate.effectiveTier === 'priority',
  );
  const usersToUpdate = priority.filter((candidate) => candidate.dueForRefresh);

  const counts = {
    jobId,
    source,
    candidatesTotal: candidates.length,
    usersToUpdate: usersToUpdate.length,
    skippedNotDue: priority.length - usersToUpdate.length,
    skippedByTier: candidates.length - priority.length,
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
