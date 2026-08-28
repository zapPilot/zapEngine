const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * The floor every derived window is measured against. Every GitHub workflow in
 * `.github/schedules.json` runs daily today, and 48h is the silence that told
 * an operator the cron had stopped rather than had a slow night. Keeping it as
 * a floor means deriving windows changes nothing for the fleet as it stands.
 */
export const DEFAULT_STALE_AFTER_MS = 48 * HOUR_MS;

const CRON_FIELDS = 5;

/**
 * A deliberately coarse upper bound on the gap between two firings — not a
 * cron parser, and not trying to be one.
 *
 * The result only ever widens a staleness window, so erring long costs a
 * delayed alert while erring short costs an alert nobody can act on: a weekly
 * job judged against a daily window is red six days out of seven, and a row
 * that is always red stops being read. That asymmetry is why a field this
 * function cannot model resolves to the longest plausible period rather than
 * the exact one, and why an expression it cannot model at all returns null so
 * the caller falls back to the floor instead of to a guess.
 */
export function estimateCronIntervalMs(schedule: string): number | null {
  const fields = schedule.trim().split(/\s+/);
  const [, hour, dayOfMonth, month, dayOfWeek] = fields;
  if (
    fields.length !== CRON_FIELDS ||
    !hour ||
    !dayOfMonth ||
    !month ||
    !dayOfWeek
  ) {
    // Six fields is a seconds-resolution dialect GitHub does not accept, and
    // fewer is not an expression at all; both are someone else's syntax.
    return null;
  }

  // Order matters, coarsest first: a restricted day-of-week bounds the period
  // at a week regardless of what the hour field says, so testing the hour
  // first would report an hourly job that only fires on Mondays.
  if (isRestricted(dayOfWeek)) {
    return 7 * DAY_MS;
  }
  if (isRestricted(dayOfMonth)) {
    return 31 * DAY_MS;
  }
  if (isRestricted(month)) {
    // A quarterly or annual job has no single meaningful gap, and inventing
    // one would be the under-estimate this function exists to avoid.
    return null;
  }

  if (hour === '*') {
    return HOUR_MS;
  }
  const stepped = /^\*\/(\d+)$/.exec(hour);
  const step = stepped?.[1] ? Number(stepped[1]) : 0;
  if (step > 0) {
    return step * HOUR_MS;
  }
  // A list or range of hours fires several times a day, but the longest gap
  // between two of those firings is the wrap around midnight, which is a day.
  return DAY_MS;
}

export function staleAfterMs(input: {
  scheduleKind: string;
  schedule: string;
}): number {
  const interval =
    input.scheduleKind === 'cron'
      ? estimateCronIntervalMs(input.schedule)
      : null;
  if (interval === null) {
    return DEFAULT_STALE_AFTER_MS;
  }
  // Two periods, so a single missed firing is a slow night and a second one is
  // the cron having stopped — the same reading the fixed 48h window gave the
  // daily jobs it was calibrated on.
  return Math.max(2 * interval, DEFAULT_STALE_AFTER_MS);
}

function isRestricted(field: string): boolean {
  return field !== '*' && field !== '?';
}
