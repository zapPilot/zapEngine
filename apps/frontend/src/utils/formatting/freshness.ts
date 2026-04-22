import { logger } from '@/utils/logger';

import { dayjs, parseUtcDate } from './shared';

export type FreshnessState = 'fresh' | 'stale' | 'very-stale' | 'unknown';

export interface DataFreshness {
  relativeTime: string;
  state: FreshnessState;
  hoursSince: number;
  timestamp: string;
  isCurrent: boolean;
}

const UNKNOWN_FRESHNESS: DataFreshness = {
  relativeTime: 'Unknown',
  state: 'unknown',
  hoursSince: Infinity,
  timestamp: '',
  isCurrent: false,
};

function createUnknownFreshness(timestamp = ''): DataFreshness {
  return {
    ...UNKNOWN_FRESHNESS,
    timestamp,
  };
}

function getFreshnessState(hours: number): FreshnessState {
  if (hours <= 24) return 'fresh';
  if (hours <= 72) return 'stale';
  return 'very-stale';
}

/**
 * Calculate freshness metadata for a timestamp string.
 *
 * @param lastUpdated - ISO timestamp string
 * @returns Data freshness descriptor
 */
export function calculateDataFreshness(
  lastUpdated: string | null | undefined,
): DataFreshness {
  if (!lastUpdated) {
    return UNKNOWN_FRESHNESS;
  }

  try {
    const updateTime = parseUtcDate(lastUpdated);
    if (!updateTime) {
      return createUnknownFreshness(lastUpdated);
    }

    const hoursSince = dayjs.utc().diff(updateTime, 'hour', true);
    const state = getFreshnessState(hoursSince);

    return {
      relativeTime: updateTime.fromNow(),
      state,
      hoursSince,
      timestamp: lastUpdated,
      isCurrent: state === 'fresh',
    };
  } catch (error) {
    logger.error('Error calculating data freshness', error, 'formatters');
    return createUnknownFreshness(lastUpdated);
  }
}

/**
 * Format an ISO timestamp as a relative time string.
 *
 * @param dateString - ISO timestamp string
 * @returns Relative time or "Unknown"
 */
export function formatRelativeTime(
  dateString: string | null | undefined,
): string {
  if (!dateString) {
    return 'Unknown';
  }

  try {
    const parsedDate = parseUtcDate(dateString);
    if (!parsedDate) {
      return 'Unknown';
    }

    return parsedDate.fromNow();
  } catch {
    return 'Unknown';
  }
}
