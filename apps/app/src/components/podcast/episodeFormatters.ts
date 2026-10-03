import {
  contentLanguageBadge,
  type ContentLanguageCode,
} from '@/config/contentLanguages';
import type { TranslationKey } from '@/i18n/translations';
import { CONTENT_LANGUAGE_LOCALES, cachedDateFormatter } from '@/lib/intlDates';

export function formatPodcastEpisodeDate(
  createdAt: string,
  variant: 'short' | 'long' = 'short',
  locale: ContentLanguageCode = 'en',
): string {
  const parsed = new Date(createdAt);
  if (Number.isNaN(parsed.getTime())) return '';
  return cachedDateFormatter(CONTENT_LANGUAGE_LOCALES[locale], {
    month: variant === 'long' ? 'long' : 'short',
    day: 'numeric',
    ...(variant === 'long' ? { year: 'numeric' as const } : {}),
  }).format(parsed);
}

export function formatPodcastClock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

const DOWNLOAD_SIZE_UNITS = ['KB', 'MB', 'GB'] as const;

/** One decimal under 10, whole numbers above: "7.4 MB", "69 MB". */
function roundDownloadSize(value: number): number {
  return value < 10 ? Math.round(value * 10) / 10 : Math.round(value);
}

/** Binary-scaled size label for saved files, stepping up once it would read "1024". */
export function formatDownloadSize(bytes: number): string {
  let value = Math.max(0, bytes) / 1024;
  let unit = 0;
  while (
    unit < DOWNLOAD_SIZE_UNITS.length - 1 &&
    roundDownloadSize(value) >= 1024
  ) {
    value /= 1024;
    unit += 1;
  }
  return `${roundDownloadSize(value)} ${DOWNLOAD_SIZE_UNITS[unit]}`;
}

/** Human-readable label for a classroom section's target language (e.g. a chip or pill). */
export function classroomLanguageLabel(
  languageCode: string,
  t: (key: TranslationKey) => string,
): string {
  if (languageCode === 'ja') return t('language.japanese');
  if (languageCode === 'en') return t('language.english');
  return contentLanguageBadge(languageCode);
}

const PODCAST_PLAYBACK_SPEEDS = [0.8, 1, 1.25, 1.5, 2] as const;

export function nextPodcastPlaybackSpeed(currentSpeed: number): number {
  const currentIndex = PODCAST_PLAYBACK_SPEEDS.findIndex(
    (speed) => speed === currentSpeed,
  );
  const nextIndex =
    currentIndex < 0 ? 1 : (currentIndex + 1) % PODCAST_PLAYBACK_SPEEDS.length;
  return PODCAST_PLAYBACK_SPEEDS[nextIndex] ?? 1;
}
