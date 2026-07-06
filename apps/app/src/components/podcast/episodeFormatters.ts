import { CONTENT_LANGUAGE_OPTIONS } from '@/config/contentLanguages';

const shortDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
});

const longDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

export function formatPodcastEpisodeDate(
  createdAt: string,
  variant: 'short' | 'long' = 'short',
): string {
  const parsed = new Date(createdAt);
  if (Number.isNaN(parsed.getTime())) return '';
  const formatter = variant === 'long' ? longDateFormatter : shortDateFormatter;
  return formatter.format(parsed);
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
