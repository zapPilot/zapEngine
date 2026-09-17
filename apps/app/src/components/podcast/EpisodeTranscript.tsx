import { useMemo } from 'react';
import { Text, View } from 'react-native';

import { formatPodcastClock } from '@/components/podcast/episodeFormatters';
import {
  estimateTranscriptTiming,
  type TranscriptSegment,
} from '@/components/podcast/transcriptTiming';
import { Tap } from '@/components/ui/Tap';
import {
  resolveActiveMediaClock,
  type EpisodeMediaClock,
} from '@/integration/episodeMediaSync';
import type { PodcastEpisode } from '@/integration/podcastFeed';
import type { PodcastPlayer } from '@/integration/podcastPlayerTypes';
import { cn } from '@/lib/cn';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';

/**
 * Pressability suppresses the release-time onPress only when onLongPress exists.
 * Leave copying to native text selection so a long press does not also seek.
 */
const consumeLongPressForTextSelection = () => {};

function currentTranscriptIndex(
  segments: readonly TranscriptSegment[],
  currentTime: number,
): number {
  if (segments.length === 0) return -1;
  const index = segments.findIndex(
    (segment) => currentTime >= segment.start && currentTime < segment.end,
  );
  if (index >= 0) return index;
  const lastIndex = segments.length - 1;
  const lastSegment = segments[lastIndex];
  return lastSegment !== undefined && currentTime >= lastSegment.start
    ? lastIndex
    : 0;
}

export function EpisodeTranscript({
  episode,
  player,
  activeVideoClock,
}: {
  episode: PodcastEpisode;
  player: PodcastPlayer;
  activeVideoClock: EpisodeMediaClock | null;
}) {
  const { t } = useContentLanguage();
  const isCurrentAudio = player.nowPlaying?.id === episode.id;
  const activeClock = resolveActiveMediaClock({
    videoClock: activeVideoClock,
    isCurrentAudio,
    audioCurrentTimeSeconds: player.currentTime,
    audioDurationSeconds: player.duration,
  });
  const activeDuration = activeClock?.durationSeconds ?? 0;
  const segments = useMemo(
    () =>
      estimateTranscriptTiming(
        episode.script,
        activeClock?.durationSeconds ?? 0,
      ),
    [episode.script, activeClock?.durationSeconds],
  );
  const currentIndex =
    activeClock !== null && activeDuration > 0
      ? currentTranscriptIndex(segments, activeClock.currentTimeSeconds)
      : -1;
  const body = episode.script?.trim();

  return (
    <View className="px-5 pt-7">
      <Text className="font-sans-semibold text-[17px] text-ink">
        {t('podcast.transcript')}
      </Text>
      <View className="mt-3 border-t border-line pt-3">
        {segments.length === 0 || currentIndex < 0 ? (
          <Text selectable className="text-[13px] leading-[22px] text-ink-dim">
            {body !== undefined && body !== ''
              ? body
              : t('podcast.noTranscript')}
          </Text>
        ) : (
          <View className="gap-2">
            {segments.map((segment, index) => {
              const isCurrentSegment = index === currentIndex;
              return (
                <Tap
                  key={`${segment.start}-${segment.text}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Seek to ${formatPodcastClock(segment.start)}`}
                  onLongPress={consumeLongPressForTextSelection}
                  onPress={() => {
                    if (!isCurrentAudio) player.toggle(episode);
                    player.seek(segment.start);
                  }}
                  className={cn(
                    'rounded-xl border-l-2 px-2 py-2',
                    isCurrentSegment
                      ? 'border-accent bg-[rgba(212,197,163,.1)]'
                      : 'border-transparent',
                    index < currentIndex && 'opacity-45',
                  )}
                >
                  <View className="flex-row gap-3">
                    <Text
                      className={cn(
                        'w-11 font-mono text-[10px]',
                        isCurrentSegment ? 'text-accent' : 'text-ink-faint',
                      )}
                    >
                      {formatPodcastClock(segment.start)}
                    </Text>
                    <Text
                      selectable
                      className={cn(
                        'min-w-0 flex-1 text-[13px] leading-[21px]',
                        isCurrentSegment ? 'text-ink' : 'text-ink-dim',
                      )}
                    >
                      {segment.text}
                    </Text>
                  </View>
                </Tap>
              );
            })}
          </View>
        )}
      </View>
    </View>
  );
}
