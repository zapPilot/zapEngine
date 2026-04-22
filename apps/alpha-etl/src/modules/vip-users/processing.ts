import type { SupabaseFetcher } from '../../modules/vip-users/supabaseFetcher.js';
import type { VipUserWithActivity } from '../../types/index.js';
import { logger } from '../../utils/logger.js';
import { filterVipUsersByActivity } from './activityFiltering.js';

export interface VipUsersProcessingResult {
  usersToUpdate: VipUserWithActivity[];
  vipUsersTotal: number;
  costSavingsPercent: number;
}

export async function fetchAndFilterVipUsersForProcessing(
  supabaseFetcher: SupabaseFetcher,
  jobId: string,
  emptyUsersLogMessage: string,
): Promise<VipUsersProcessingResult> {
  const vipUsers = await supabaseFetcher.fetchVipUsersWithActivity();

  if (vipUsers.length === 0) {
    logger.warn(emptyUsersLogMessage, { jobId });
    return { usersToUpdate: [], vipUsersTotal: 0, costSavingsPercent: 0 };
  }

  const { usersToUpdate, costSavingsPercent, stats } =
    filterVipUsersByActivity(vipUsers);

  logger.info('Users filtered by activity', {
    jobId,
    totalVipUsers: vipUsers.length,
    usersToUpdate: usersToUpdate.length,
    usersSkipped: stats.inactiveSkipped,
    costSavingsPercent: `${costSavingsPercent}%`,
    breakdown: {
      neverUpdated: stats.neverUpdated,
      activeUsers: stats.activeUsers,
      inactiveUpdated: stats.inactiveUpdated,
    },
  });

  return {
    usersToUpdate,
    vipUsersTotal: vipUsers.length,
    costSavingsPercent,
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
