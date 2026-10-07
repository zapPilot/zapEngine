import type { CustomerRecord } from './types.js';

/** Cadence comes from get_user_service_states(), independently of plan tier. */
export function freshWindowHours(interval: number): number {
  return interval + 6;
}

export function staleWindowHours(interval: number): number {
  return interval + 24;
}

/** Inactive users on weekly cadence already follow the owner's policy. */
export function isInactivePriorityOnFastCadence(
  user: Pick<
    CustomerRecord,
    'effectiveTier' | 'refreshIntervalHours' | 'inactiveDays'
  >,
): boolean {
  return (
    user.effectiveTier === 'priority' &&
    user.refreshIntervalHours !== null &&
    user.refreshIntervalHours < 168 &&
    (user.inactiveDays === null || user.inactiveDays >= 30)
  );
}
