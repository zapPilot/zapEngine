import type { ContentLanguageCode } from '@/config/contentLanguages';

const DATE_LOCALES: Readonly<Record<ContentLanguageCode, string>> = {
  en: 'en-US',
  'zh-Hant': 'zh-TW',
  ja: 'ja-JP',
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
  return new Intl.DateTimeFormat(DATE_LOCALES[languageCode], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}
