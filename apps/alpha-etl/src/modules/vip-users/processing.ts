import type { VipUserWithActivity } from '../../types/index.js';
import { logger } from '../../utils/logger.js';
import type { SupabaseFetcher } from './supabaseFetcher.js';

export interface VipUsersProcessingResult {
  usersToUpdate: VipUserWithActivity[];
  vipUsersTotal: number;
}

export async function fetchAndFilterVipUsersForProcessing(
  supabaseFetcher: SupabaseFetcher,
  jobId: string,
  emptyUsersLogMessage: string,
): Promise<VipUsersProcessingResult> {
  const vipUsers = await supabaseFetcher.fetchVipUsersWithActivity();

  if (vipUsers.length === 0) {
    logger.warn(emptyUsersLogMessage, { jobId });
    return { usersToUpdate: [], vipUsersTotal: 0 };
  }

  logger.info('VIP users scheduled for daily processing', {
    jobId,
    totalVipUsers: vipUsers.length,
    usersToUpdate: vipUsers.length,
  });

  return {
    usersToUpdate: vipUsers,
    vipUsersTotal: vipUsers.length,
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
