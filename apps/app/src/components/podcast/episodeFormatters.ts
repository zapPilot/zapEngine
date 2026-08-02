import {
  CONTENT_LANGUAGE_OPTIONS,
  type ContentLanguageCode,
} from '@/config/contentLanguages';

const INTL_LOCALES: Readonly<Record<ContentLanguageCode, string>> = {
  en: 'en-US',
  'zh-Hant': 'zh-TW',
  ja: 'ja-JP',
};

export function formatPodcastEpisodeDate(
  createdAt: string,
  variant: 'short' | 'long' = 'short',
  locale: ContentLanguageCode = 'en',
): string {
  const parsed = new Date(createdAt);
  if (Number.isNaN(parsed.getTime())) return '';
  return new Intl.DateTimeFormat(INTL_LOCALES[locale], {
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

export function languageBadgeFor(languageCode: string): string {
  return (
    CONTENT_LANGUAGE_OPTIONS.find((option) => option.code === languageCode)
      ?.badge ?? languageCode.slice(0, 2).toUpperCase()
  );
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
