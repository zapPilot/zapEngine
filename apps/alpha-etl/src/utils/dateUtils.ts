/**
 * Date utility functions for gap detection and date range manipulation
 * Used by backfill operations to identify missing dates in database
 */

function normalizeToUtcMidnight(date: Date): Date {
  const normalized = new Date(date);
  normalized.setUTCHours(0, 0, 0, 0);
  return normalized;
}

/**
 * Generate array of dates between start and end (inclusive)
 * All dates normalized to midnight UTC for consistent comparison
 *
 * @param startDate - Start of date range
 * @param endDate - End of date range
 * @returns Array of Date objects, one per day
 *
 * @example
 * const start = new Date('2024-12-01');
 * const end = new Date('2024-12-03');
 * const dates = generateDateRange(start, end);
 * // Returns: [2024-12-01, 2024-12-02, 2024-12-03]
 */
export function generateDateRange(startDate: Date, endDate: Date): Date[] {
  const dates: Date[] = [];

  const start = normalizeToUtcMidnight(startDate);
  const end = normalizeToUtcMidnight(endDate);

  // Generate date array
  const current = new Date(start);
  while (current <= end) {
    dates.push(new Date(current));
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return dates;
}

/**
 * Calculate missing dates by comparing requested range vs existing dates
 * Uses Set for O(n) lookup performance
 *
 * @param allDates - Complete array of dates in range (from generateDateRange)
 * @param existingDates - Array of date strings (YYYY-MM-DD) already in database
 * @returns Array of Date objects representing missing dates
 *
 * @example
 * const all = generateDateRange(new Date('2024-12-01'), new Date('2024-12-05'));
 * const existing = ['2024-12-01', '2024-12-03', '2024-12-05'];
 * const missing = calculateMissingDates(all, existing);
 * // Returns: [2024-12-02, 2024-12-04]
 */
export function calculateMissingDates(
  allDates: Date[],
  existingDates: string[],
): Date[] {
  const existingSet = new Set(existingDates);

  return allDates.filter(
    (date) => !existingSet.has(formatDateToYYYYMMDD(date)),
  );
}

/**
 * Format Date object to YYYY-MM-DD string (database format)
 * Handles timezone normalization to ensure consistent formatting
 *
 * @param date - JavaScript Date object
 * @returns Date string in YYYY-MM-DD format
 *
 * @example
 * const date = new Date('2024-12-25T10:30:00Z');
 * const formatted = formatDateToYYYYMMDD(date);
 * // Returns: '2024-12-25'
 */
export function formatDateToYYYYMMDD(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export interface SnapshotTimeContext {
  snapshotAt: string;
  epochSeconds: number;
}

/**
 * Resolve a snapshot timestamp to both ISO string and epoch seconds.
 * Defaults to current time if no timestamp is provided.
 */
export function resolveSnapshotTime(timestamp?: string): SnapshotTimeContext {
  const snapshotAt = timestamp || new Date().toISOString();
  const epochSeconds = Math.floor(new Date(snapshotAt).getTime() / 1000);
  return { snapshotAt, epochSeconds };
}
