import Slider from '@react-native-community/slider';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Bookmark,
  ChevronLeft,
  Gauge,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Share2,
  SkipBack,
  SkipForward,
} from 'lucide-react-native';
import { type ReactNode, useMemo } from 'react';
import { Share, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PodcastLanguageDropdown } from '@/components/content/ContentLanguageSelector';
import {
  formatPodcastClock,
  formatPodcastEpisodeDate,
  languageBadgeFor,
  nextPodcastPlaybackSpeed,
} from '@/components/podcast/episodeFormatters';
import {
  estimateTranscriptTiming,
  type TranscriptSegment,
} from '@/components/podcast/transcriptTiming';
import { Card } from '@/components/ui/Card';
import { ScreenScrollView } from '@/components/ui/ScreenScrollView';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import { Tap } from '@/components/ui/Tap';
import {
  findPodcastEpisodeById,
  usePodcastEpisodes,
} from '@/integration/podcastFeed';
import type {
  PodcastEpisode,
  PodcastLanguageClassroomKeyword,
  PodcastLanguageClassroomLesson,
} from '@/integration/podcastFeed';
import { cn } from '@/lib/cn';
import { usePodcastPlayer } from '@/providers/PodcastPlayerProvider';
import type { PodcastPlayer } from '@/integration/podcastPlayerTypes';

function episodeParamToString(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

function IconButton({
  label,
  disabled = false,
  onPress,
  children,
}: {
  label: string;
  disabled?: boolean;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      className={cn(
        'h-11 w-11 items-center justify-center rounded-full border',
        disabled
          ? 'border-line bg-[rgba(255,255,255,.03)] opacity-40'
          : 'border-[rgba(212,197,163,.28)] bg-[rgba(212,197,163,.12)]',
      )}
    >
      {children}
    </Tap>
  );
}

function EpisodeDetailHeader({
  episode,
  onBack,
}: {
  episode: PodcastEpisode;
  onBack: () => void;
}) {
  const shareEpisode = () => {
    void Share.share({
      title: episode.title,
      message: `${episode.title}\nFrom Fed to Chain`,
    });
  };

  return (
    <View className="flex-row items-center justify-between px-5 pb-3">
      <View className="flex-row items-center gap-3">
        <IconButton label="Back" onPress={onBack}>
          <ChevronLeft size={20} strokeWidth={2} color="#d4c5a3" />
        </IconButton>
        <PodcastLanguageDropdown />
      </View>
      <Text className="min-w-0 flex-1 px-3 text-center font-sans-semibold text-[14px] text-ink">
        From Fed to Chain
      </Text>
      <IconButton label="Share episode" onPress={shareEpisode}>
        <Share2 size={18} strokeWidth={2} color="#d4c5a3" />
      </IconButton>
    </View>
  );
}

function EpisodeHeroCard({ episode }: { episode: PodcastEpisode }) {
  const date = formatPodcastEpisodeDate(episode.createdAt, 'long');

  return (
    <View className="px-5">
      <Card className="overflow-hidden p-5">
        <View className="absolute -right-7 top-5 h-28 w-28 rounded-full border border-[rgba(212,197,163,.13)] bg-[rgba(212,197,163,.05)]" />
        <View className="mb-5 h-12 w-12 items-center justify-center rounded-2xl border border-[rgba(212,197,163,.26)] bg-[rgba(212,197,163,.1)]">
          <Text className="font-mono text-[11px] font-bold text-accent">
            {languageBadgeFor(episode.languageCode)}
          </Text>
        </View>
        <Text className="font-sans-bold text-[25px] leading-[31px] text-ink">
          {episode.title}
        </Text>
        <View className="mt-4 flex-row flex-wrap items-center gap-2">
          {date !== '' ? (
            <Text className="font-mono text-[10px] uppercase tracking-[1px] text-ink-faint">
              {date}
            </Text>
          ) : null}
          <Text className="font-mono text-[10px] uppercase tracking-[1px] text-ink-faint">
            {episode.listened ? 'Listened' : 'Unplayed'}
          </Text>
          {episode.likeCount > 0 ? (
            <Text className="font-mono text-[10px] uppercase tracking-[1px] text-ink-faint">
              {episode.likeCount} likes
            </Text>
          ) : null}
        </View>
      </Card>
    </View>
  );
}

function EpisodePlaybackControls({
  episode,
  episodes,
  player,
  onEpisodeChanged,
}: {
  episode: PodcastEpisode;
  episodes: readonly PodcastEpisode[];
  player: PodcastPlayer;
  onEpisodeChanged: (episode: PodcastEpisode) => void;
}) {
  const isCurrent = player.nowPlaying?.id === episode.id;
  const duration = isCurrent ? Math.floor(player.duration) : 0;
  const currentTime = isCurrent
    ? Math.min(Math.floor(player.currentTime), duration)
    : 0;
  const isPlaying = isCurrent && player.isPlaying;

  const play = () => player.playFromQueue(episodes, episode);
  const skipPrevious = () => {
    const nextEpisode = player.skipToPreviousEpisode();
    if (nextEpisode !== null) onEpisodeChanged(nextEpisode);
  };
  const skipNext = () => {
    const nextEpisode = player.skipToNextEpisode();
    if (nextEpisode !== null) onEpisodeChanged(nextEpisode);
  };

  return (
    <View className="px-5 pt-5">
      <View className="rounded-[28px] border border-line bg-surface p-5">
        <Slider
          accessibilityLabel="Seek episode"
          disabled={!isCurrent || duration <= 0}
          minimumValue={0}
          maximumValue={duration > 0 ? duration : 1}
          value={currentTime}
          minimumTrackTintColor="#d4c5a3"
          maximumTrackTintColor="rgba(255,255,255,.12)"
          thumbTintColor="#d4c5a3"
          onSlidingComplete={player.seek}
          style={{ height: 32 }}
        />
        <View className="mt-1 flex-row items-center justify-between px-1">
          <Text className="font-mono text-[10px] text-ink-faint">
            {formatPodcastClock(currentTime)}
          </Text>
          <Text className="font-mono text-[10px] text-ink-faint">
            {formatPodcastClock(duration)}
          </Text>
        </View>

        <View className="mt-5 flex-row items-center justify-between">
          <IconButton
            label="Rewind 15 seconds"
            disabled={!isCurrent}
            onPress={() => player.seekRelative(-15)}
          >
            <RotateCcw size={19} strokeWidth={2} color="#d4c5a3" />
          </IconButton>
          <IconButton
            label="Previous episode"
            disabled={!player.hasPreviousEpisode}
            onPress={skipPrevious}
          >
            <SkipBack size={20} strokeWidth={2} color="#d4c5a3" />
          </IconButton>
          <Tap
            accessibilityRole="button"
            accessibilityLabel={isPlaying ? 'Pause episode' : 'Play episode'}
            onPress={play}
            className="h-[72px] w-[72px] items-center justify-center rounded-full border border-[rgba(212,197,163,.35)] bg-[rgba(212,197,163,.18)]"
          >
            {isPlaying ? (
              <Pause size={31} strokeWidth={2.1} color="#d4c5a3" />
            ) : (
              <Play size={31} strokeWidth={2.1} color="#d4c5a3" />
            )}
          </Tap>
          <IconButton
            label="Next episode"
            disabled={!player.hasNextEpisode}
            onPress={skipNext}
          >
            <SkipForward size={20} strokeWidth={2} color="#d4c5a3" />
          </IconButton>
          <IconButton
            label="Forward 30 seconds"
            disabled={!isCurrent}
            onPress={() => player.seekRelative(30)}
          >
            <RotateCw size={19} strokeWidth={2} color="#d4c5a3" />
          </IconButton>
        </View>

        <View className="mt-5 items-end">
          <Tap
            accessibilityRole="button"
            accessibilityLabel="Change playback speed"
            onPress={() =>
              player.setSpeed(nextPodcastPlaybackSpeed(player.speed))
            }
            className="flex-row items-center gap-2 rounded-full border border-line bg-[rgba(255,255,255,.04)] px-3 py-2"
          >
            <Gauge size={14} strokeWidth={2} color="#a1a1aa" />
            <Text className="font-mono text-[11px] text-ink-dim">
              {player.speed}x
            </Text>
          </Tap>
        </View>
      </View>
    </View>
  );
}

function EpisodeActionRow() {
  return (
    <View className="px-5 pt-4">
      <View className="flex-row justify-evenly rounded-[22px] border border-line bg-[rgba(255,255,255,.035)] p-3">
        <View className="items-center gap-1">
          <Bookmark size={18} strokeWidth={2} color="#a1a1aa" />
          <Text className="font-mono text-[9px] uppercase tracking-[0.9px] text-ink-faint">
            Save later
          </Text>
        </View>
        <View className="items-center gap-1">
          <Share2 size={18} strokeWidth={2} color="#a1a1aa" />
          <Text className="font-mono text-[9px] uppercase tracking-[0.9px] text-ink-faint">
            Share
          </Text>
        </View>
      </View>
    </View>
  );
}

function keywordSupportingText(
  keyword: PodcastLanguageClassroomKeyword,
): string {
  return [keyword.reading, keyword.meaning, keyword.note]
    .filter((item): item is string => item !== null && item.trim() !== '')
    .join(' · ');
}

function LanguageClassroomSection({
  lessons,
}: {
  lessons: readonly PodcastLanguageClassroomLesson[];
}) {
  if (lessons.length === 0) return null;

  return (
    <View className="px-5 pt-7">
      <Text className="font-sans-semibold text-[17px] text-ink">
        Language Classroom
      </Text>
      <View className="mt-3 gap-3">
        {lessons.map((lesson) => (
          <Card
            key={`${lesson.targetLanguageCode}-${lesson.oneLiner}`}
            className="p-4"
          >
            <View className="flex-row items-start gap-3">
              <View className="rounded-full border border-[rgba(212,197,163,.3)] bg-[rgba(212,197,163,.12)] px-3 py-1">
                <Text className="font-mono text-[10px] font-bold text-accent">
                  {languageBadgeFor(lesson.targetLanguageCode)}
                </Text>
              </View>
              <Text className="min-w-0 flex-1 font-sans-semibold text-[13px] leading-[19px] text-ink">
                {lesson.oneLiner}
              </Text>
            </View>
            <View className="mt-4 flex-row flex-wrap gap-2">
              {lesson.keywords.map((keyword) => (
                <View
                  key={`${keyword.term}-${keyword.meaning}`}
                  className="max-w-[260px] rounded-xl bg-[rgba(255,255,255,.055)] px-3 py-2"
                >
                  <Text className="font-sans-semibold text-[13px] text-ink">
                    {keyword.term}
                  </Text>
                  <Text className="mt-1 text-[11px] leading-[15px] text-ink-dim">
                    {keywordSupportingText(keyword)}
                  </Text>
                </View>
              ))}
            </View>
          </Card>
        ))}
      </View>
    </View>
  );
}

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

function EpisodeTranscript({
  episode,
  player,
}: {
  episode: PodcastEpisode;
  player: PodcastPlayer;
}) {
  const isCurrent = player.nowPlaying?.id === episode.id;
  const segments = useMemo(
    () =>
      estimateTranscriptTiming(episode.script, isCurrent ? player.duration : 0),
    [episode.script, isCurrent, player.duration],
  );
  const currentIndex =
    isCurrent && player.duration > 0
      ? currentTranscriptIndex(segments, player.currentTime)
      : -1;
  const body = episode.script?.trim();

  return (
    <View className="px-5 pt-7">
      <Text className="font-sans-semibold text-[17px] text-ink">
        Transcript
      </Text>
      <View className="mt-3 border-t border-line pt-3">
        {segments.length === 0 || currentIndex < 0 ? (
          <Text className="text-[13px] leading-[22px] text-ink-dim">
            {body !== undefined && body !== ''
              ? body
              : 'No script available yet.'}
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
                  onPress={() => {
                    if (!isCurrent) player.toggle(episode);
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

function DetailSkeleton() {
  return (
    <View className="px-5 pt-4" accessibilityRole="progressbar">
      <SkeletonBlock className="h-[210px] rounded-[28px]" />
      <SkeletonBlock className="mt-5 h-[210px] rounded-[28px]" />
      <SkeletonBlock className="mt-7 h-5 w-32" />
      <SkeletonBlock className="mt-3 h-40 rounded-[20px]" />
    </View>
  );
}

export function EpisodeDetailScreen() {
  const params = useLocalSearchParams<{ episodeId?: string | string[] }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const routeEpisodeId = decodeURIComponent(
    episodeParamToString(params.episodeId),
  );
  const { data, isLoading, isError } = usePodcastEpisodes();
  const player = usePodcastPlayer();
  const episodes = data ?? [];
  const episode = findPodcastEpisodeById(episodes, routeEpisodeId);

  const handleEpisodeChanged = (nextEpisode: PodcastEpisode) => {
    router.replace(
      `/podcast/${encodeURIComponent(nextEpisode.localizationId)}`,
    );
  };

  if (episode === null) {
    return (
      <View
        className="flex-1 bg-bg"
        style={{ paddingTop: Math.max(insets.top, 12) }}
      >
        <View className="flex-row items-center px-5 pb-3">
          <IconButton label="Back" onPress={() => router.back()}>
            <ChevronLeft size={20} strokeWidth={2} color="#d4c5a3" />
          </IconButton>
        </View>
        {isLoading ? (
          <DetailSkeleton />
        ) : (
          <View className="px-5 pt-4">
            <Card className="p-5">
              <Text className="font-sans-semibold text-[16px] text-ink">
                {isError ? 'Podcast unavailable' : 'Episode not found'}
              </Text>
              <Text className="mt-2 text-[13px] leading-5 text-ink-dim">
                {isError
                  ? 'The podcast feed is unavailable right now.'
                  : 'This episode is not in the current language feed.'}
              </Text>
            </Card>
          </View>
        )}
      </View>
    );
  }

  return (
    <View className="flex-1 bg-bg">
      <ScreenScrollView bottomPadding={36}>
        <EpisodeDetailHeader episode={episode} onBack={() => router.back()} />
        <EpisodeHeroCard episode={episode} />
        <EpisodePlaybackControls
          episode={episode}
          episodes={episodes}
          player={player}
          onEpisodeChanged={handleEpisodeChanged}
        />
        <EpisodeActionRow />
        <LanguageClassroomSection lessons={episode.languageClassrooms} />
        <EpisodeTranscript episode={episode} player={player} />
      </ScreenScrollView>
    </View>
  );
}
