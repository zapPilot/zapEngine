import type { ContentLanguageCode } from '@/config/contentLanguages';
import { CONTENT_LANGUAGE_LOCALES, cachedDateFormatter } from '@/lib/intlDates';

const SNAPSHOT_DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
};

function parsedDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function isSnapshotToday(
  value: string | null | undefined,
  now = new Date(),
): boolean {
  const date = parsedDate(value);
  return (
    date !== null &&
    date.getUTCFullYear() === now.getUTCFullYear() &&
    date.getUTCMonth() === now.getUTCMonth() &&
    date.getUTCDate() === now.getUTCDate()
  );
}

export function formatSnapshotDate(
  value: string | null | undefined,
  languageCode: ContentLanguageCode,
): string | null {
  const date = parsedDate(value);
  if (date === null) return null;
  return cachedDateFormatter(
    CONTENT_LANGUAGE_LOCALES[languageCode],
    SNAPSHOT_DATE_OPTIONS,
  ).format(date);
}
