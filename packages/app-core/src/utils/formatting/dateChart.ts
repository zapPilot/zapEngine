/**
 * Format a date value for chart tooltip and detail displays.
 *
 * @param date - Date string or Date instance
 * @returns Human-readable US date string
 */
export function formatChartDate(date: string | Date): string {
  const parsed = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(parsed.getTime())) {
    return typeof date === 'string' ? date : '';
  }

  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Format a date for chart axis ticks (compact: "Mar 24").
 *
 * @param value - Date string or timestamp
 * @returns Compact axis label
 */
export function formatChartAxisDate(value: string | number): string {
  return new Date(value).toLocaleDateString(undefined, {
    month: 'short',
    year: '2-digit',
  });
}

/**
 * Format a currency value for Y-axis ticks (compact: "$42k").
 *
 * @param value - Dollar amount
 * @returns Formatted axis string
 */
export function formatCurrencyAxis(value: string | number): string {
  return `$${(Number(value) / 1000).toFixed(0)}k`;
}

/**
 * Format a sentiment score for axis ticks.
 *
 * @param value - Sentiment score (0-100)
 * @returns Label string for well-known anchor points or the numeric value
 */
export function formatSentiment(value: number): string {
  if (value === 0) return 'Fear';
  if (value === 50) return 'Neutral';
  if (value === 100) return 'Greed';
  return String(value);
}
