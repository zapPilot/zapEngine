import dayjs, { type Dayjs } from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import utc from 'dayjs/plugin/utc';

dayjs.extend(relativeTime);
dayjs.extend(utc);

export interface BaseFormatOptions {
  /** Show hidden placeholder when true */
  isHidden?: boolean;
  /** Locale for formatting */
  locale?: string;
  /** Smart precision mode: adjusts presentation based on magnitude */
  smartPrecision?: boolean;
}

export { dayjs };
export type { Dayjs };

export function parseUtcDate(dateString: string): Dayjs | null {
  const parsedDate = dayjs.utc(dateString);
  return parsedDate.isValid() ? parsedDate : null;
}

export function normalizeFormatOptions<T extends BaseFormatOptions>(
  optionsOrIsHidden: T | boolean,
  defaults: T,
): T {
  return typeof optionsOrIsHidden === 'boolean'
    ? { ...defaults, isHidden: optionsOrIsHidden }
    : { ...defaults, ...optionsOrIsHidden };
}
