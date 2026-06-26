/**
 * Date-related constants shared across analytics and visualization components.
 */

/**
 * Standard 3-letter month abbreviations (Jan–Dec), indexed 0–11.
 *
 * @example
 * ```typescript
 * MONTH_ABBREVIATIONS[0]  // "Jan"
 * MONTH_ABBREVIATIONS[11] // "Dec"
 * ```
 */
export const MONTH_ABBREVIATIONS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;
