import type { ContentLanguageCode } from '@/config/contentLanguages';

const DATE_LOCALES: Readonly<Record<ContentLanguageCode, string>> = {
  en: 'en-US',
  'zh-Hant': 'zh-TW',
  ja: 'ja-JP',
};

const SNAPSHOT_DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
};

/**
 * One formatter per locale. Constructing an `Intl.DateTimeFormat` costs far
 * more than formatting with one, and the trend tooltip re-labels its snapshot
 * on every pointer move. The locale is the whole key because the option set
 * above is a constant.
 */
const snapshotFormatters = new Map<string, Intl.DateTimeFormat>();

function snapshotFormatter(locale: string): Intl.DateTimeFormat {
  const cached = snapshotFormatters.get(locale);
  if (cached) return cached;

  const formatter = new Intl.DateTimeFormat(locale, SNAPSHOT_DATE_OPTIONS);
  snapshotFormatters.set(locale, formatter);
  return formatter;
}

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
  return snapshotFormatter(DATE_LOCALES[languageCode]).format(date);
}
