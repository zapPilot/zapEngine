import { logger } from "../../utils/logger.js";
import { maskWalletAddress } from "../../utils/mask.js";
import type { VipUserWithActivity } from "../../types/index.js";
import { TIME_CONSTANTS } from "../../config/database.js";

/**
 * Activity-based update frequency thresholds
 */
export const ACTIVITY_THRESHOLDS = {
  /** 7 days in milliseconds - threshold for considering a user inactive */
  SEVEN_DAYS_MS: 7 * 24 * 60 * 60 * 1000,
} as const;

/**
 * Options for configuring user filtering behavior
 */
export interface UserFilteringOptions {
  /**
   * Time threshold (ms) for considering a user inactive
   * @default ACTIVITY_THRESHOLDS.SEVEN_DAYS_MS (7 days)
   */
  inactivityThresholdMs?: number;

  /**
   * Time threshold (ms) for when to update an inactive user
   * @default ACTIVITY_THRESHOLDS.SEVEN_DAYS_MS (7 days)
   */
  updateThresholdMs?: number;
}

/**
 * Statistics from filtering users by activity
 */
export interface FilteringStats {
  /** Total number of users evaluated */
  totalUsers: number;
  /** Users who have never been updated before */
  neverUpdated: number;
  /** Active users (activity within threshold) */
  activeUsers: number;
  /** Inactive users that should be updated (last update >= threshold) */
  inactiveUpdated: number;
  /** Inactive users that should be skipped (last update < threshold) */
  inactiveSkipped: number;
}

/**
 * Result of filtering VIP users by activity
 */
export interface FilteringResult {
  /** Users that should be updated */
  usersToUpdate: VipUserWithActivity[];
  /** Users that should be skipped */
  usersSkipped: VipUserWithActivity[];
  /** Percentage of users skipped (cost savings) */
  costSavingsPercent: number;
  /** Detailed statistics breakdown */
  stats: FilteringStats;
}

interface ResolvedThresholds {
  inactivityThresholdMs: number;
  updateThresholdMs: number;
}

function resolveThresholds(options: UserFilteringOptions): ResolvedThresholds {
  return {
    inactivityThresholdMs:
      options.inactivityThresholdMs ?? ACTIVITY_THRESHOLDS.SEVEN_DAYS_MS,
    updateThresholdMs:
      options.updateThresholdMs ?? ACTIVITY_THRESHOLDS.SEVEN_DAYS_MS,
  };
}

function parseTimestamp(value: string | null): Date | null {
  return value ? new Date(value) : null;
}

function toElapsedDays(elapsedMs: number): number {
  return Math.floor(elapsedMs / TIME_CONSTANTS.MS_PER_DAY);
}

function calculateDaysSince(date: Date | null, nowMs: number): number | null {
  if (!date) {
    return null;
  }

  return toElapsedDays(nowMs - date.getTime());
}

function isActiveWithinThreshold(
  lastActivity: Date | null,
  nowMs: number,
  thresholdMs: number,
): boolean {
  if (!lastActivity) {
    return false;
  }

  return nowMs - lastActivity.getTime() < thresholdMs;
}

/**
 * Determines if a user's portfolio should be updated based on activity
 *
 * Logic:
 * - Never updated before → UPDATE
 * - Active user (activity within inactivity threshold) → UPDATE
 * - Inactive user (no activity >= inactivity threshold) → UPDATE only if last update was >= update threshold ago
 *
 * @param user - VIP user with activity timestamps
 * @param options - Configuration options for thresholds
 * @returns true if user should be updated, false otherwise
 */
export function shouldUpdateUser(
  user: VipUserWithActivity,
  options: UserFilteringOptions = {},
): boolean {
  const { inactivityThresholdMs, updateThresholdMs } =
    resolveThresholds(options);
  const nowMs = Date.now();
  const lastActivity = parseTimestamp(user.last_activity_at);
  const lastUpdate = parseTimestamp(user.last_portfolio_update_at);

  // Always update if never updated before
  if (!lastUpdate) {
    logger.debug("User has never been updated - scheduling update", {
      userId: user.user_id,
      wallet: maskWalletAddress(user.wallet),
    });
    return true;
  }

  // Active user (activity within threshold): always update
  if (
    lastActivity &&
    isActiveWithinThreshold(lastActivity, nowMs, inactivityThresholdMs)
  ) {
    const daysSinceActivity = calculateDaysSince(lastActivity, nowMs);
    logger.debug("Active user - scheduling update", {
      userId: user.user_id,
      wallet: maskWalletAddress(user.wallet),
      daysSinceActivity,
    });
    return true;
  }

  // Inactive user: only update if last update was >= threshold ago
  const elapsedSinceUpdate = nowMs - lastUpdate.getTime();
  const daysSinceUpdate = toElapsedDays(elapsedSinceUpdate);
  const shouldUpdate = elapsedSinceUpdate >= updateThresholdMs;

  const daysSinceActivity = calculateDaysSince(lastActivity, nowMs);

  const thresholdDays = Math.round(
    updateThresholdMs / TIME_CONSTANTS.MS_PER_DAY,
  );
  const decisionMessage = buildInactiveDecisionLogMessage(
    shouldUpdate,
    thresholdDays,
  );
  const decisionPayload = buildInactiveDecisionLogPayload(
    user,
    daysSinceActivity,
    daysSinceUpdate,
    shouldUpdate,
  );
  logger.debug(decisionMessage, decisionPayload);

  return shouldUpdate;
}

/**
 * Filters VIP users based on activity and returns detailed statistics
 *
 * This is a pure function that performs batch filtering and calculates
 * cost savings statistics for monitoring and logging purposes.
 *
 * @param users - Array of VIP users with activity data
 * @param options - Configuration options for thresholds
 * @returns Filtering result with users to update, skipped users, and statistics
 *
 * @example
 * ```typescript
 * const vipUsers = await supabaseFetcher.fetchVipUsersWithActivity();
 * const filterResult = filterVipUsersByActivity(vipUsers);
 *
 * logger.info('Users filtered', {
 *   total: filterResult.stats.totalUsers,
 *   toUpdate: filterResult.usersToUpdate.length,
 *   skipped: filterResult.usersSkipped.length,
 *   costSavings: `${filterResult.costSavingsPercent}%`
 * });
 *
 * for (const user of filterResult.usersToUpdate) {
 *   // Process only users that should be updated
 * }
 * ```
 */
export function filterVipUsersByActivity(
  users: VipUserWithActivity[],
  options: UserFilteringOptions = {},
): FilteringResult {
  const { inactivityThresholdMs } = resolveThresholds(options);
  const nowMs = Date.now();
  const stats: FilteringStats = {
    totalUsers: users.length,
    neverUpdated: 0,
    activeUsers: 0,
    inactiveUpdated: 0,
    inactiveSkipped: 0,
  };

  const usersToUpdate: VipUserWithActivity[] = [];
  const usersSkipped: VipUserWithActivity[] = [];

  for (const user of users) {
    const shouldUpdate = shouldUpdateUser(user, options);

    if (shouldUpdate) {
      usersToUpdate.push(user);
      updateFilteringStatsForScheduledUser(
        stats,
        user,
        nowMs,
        inactivityThresholdMs,
      );
    } else {
      usersSkipped.push(user);
      stats.inactiveSkipped++;
    }
  }

  const costSavingsPercent = calculateCostSavingsPercent(
    users.length,
    usersSkipped.length,
  );

  return {
    usersToUpdate,
    usersSkipped,
    costSavingsPercent,
    stats,
  };
}

function calculateCostSavingsPercent(
  totalUsers: number,
  skippedUsers: number,
): number {
  if (totalUsers <= 0) {
    return 0;
  }

  return Math.round((skippedUsers / totalUsers) * 100);
}

function updateFilteringStatsForScheduledUser(
  stats: FilteringStats,
  user: VipUserWithActivity,
  nowMs: number,
  inactivityThresholdMs: number,
): void {
  if (!user.last_portfolio_update_at) {
    stats.neverUpdated++;
    return;
  }

  const lastActivity = parseTimestamp(user.last_activity_at);
  const isActive = isActiveWithinThreshold(
    lastActivity,
    nowMs,
    inactivityThresholdMs,
  );

  if (isActive) {
    stats.activeUsers++;
    return;
  }

  stats.inactiveUpdated++;
}

function buildInactiveDecisionLogMessage(
  shouldUpdate: boolean,
  thresholdDays: number,
): string {
  if (shouldUpdate) {
    return `Inactive user - scheduling update (>${thresholdDays} days since last update)`;
  }

  return `Inactive user - skipping update (<${thresholdDays} days since last update)`;
}

function buildInactiveDecisionLogPayload(
  user: VipUserWithActivity,
  daysSinceActivity: number | null,
  daysSinceUpdate: number,
  shouldUpdate: boolean,
): {
  userId: string;
  wallet: string;
  daysSinceActivity: number | "never";
  daysSinceUpdate: number;
  shouldUpdate: boolean;
} {
  return {
    userId: user.user_id,
    wallet: maskWalletAddress(user.wallet),
    daysSinceActivity: daysSinceActivity ?? "never",
    daysSinceUpdate,
    shouldUpdate,
  };
}
