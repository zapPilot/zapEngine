import { useLocalSearchParams, useRouter } from 'expo-router';
import { Bookmark, ChevronLeft, Share2 } from 'lucide-react-native';
import { useMemo } from 'react';
import { Share, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PodcastLanguageDropdown } from '@/components/content/ContentLanguageSelector';
import {
  EpisodeMediaPlayer,
  PodcastIconButton,
} from '@/components/podcast/EpisodeMediaPlayer';
import {
  formatPodcastClock,
  formatPodcastEpisodeDate,
  languageBadgeFor,
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
  getPodcastEpisodeShareUrl,
  usePodcastEpisode,
  usePodcastEpisodes,
} from '@/integration/podcastFeed';
import type {
  PodcastEpisode,
  PodcastLanguageClassroomKeyword,
  PodcastLanguageClassroomLesson,
} from '@/integration/podcastFeed';
import { mergeEpisodeProgress } from '@/integration/podcastProgress';
import { cn } from '@/lib/cn';
import { usePodcastPlayer } from '@/providers/PodcastPlayerProvider';
import { useEpisodeProgress } from '@/providers/PodcastProgressProvider';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';
import type { PodcastPlayer } from '@/integration/podcastPlayerTypes';

function episodeParamToString(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

function EpisodeDetailHeader({
  episode,
  onBack,
}: {
  episode: PodcastEpisode;
  onBack: () => void;
}) {
  const shareEpisode = () => {
    const shareUrl = getPodcastEpisodeShareUrl(episode);
    void Share.share({
      title: episode.title,
      message: `${episode.title}\n${shareUrl}`,
      url: shareUrl,
    });
  };

  return (
    <View className="flex-row items-center justify-between px-5 pb-3">
      <View className="flex-row items-center gap-3">
        <PodcastIconButton label="Back" onPress={onBack}>
          <ChevronLeft size={20} strokeWidth={2} color="#d4c5a3" />
        </PodcastIconButton>
        <PodcastLanguageDropdown />
      </View>
      <Text className="min-w-0 flex-1 px-3 text-center font-sans-semibold text-[14px] text-ink">
        Podcast
      </Text>
      <PodcastIconButton label="Share episode" onPress={shareEpisode}>
        <Share2 size={18} strokeWidth={2} color="#d4c5a3" />
      </PodcastIconButton>
    </View>
  );
}

function EpisodeHeroCard({ episode }: { episode: PodcastEpisode }) {
  const date = formatPodcastEpisodeDate(episode.createdAt, 'long');

  return (
    <View className="px-5">
      <Card className="overflow-hidden p-5">
        <View className="absolute -right-7 top-5 h-28 w-28 rounded-full border border-[rgba(212,197,163,.13)] bg-[rgba(212,197,163,.05)]" />
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
  const params = useLocalSearchParams<{
    episodeId?: string | string[];
    lang?: string | string[];
    language?: string | string[];
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { languageCode: selectedLanguageCode } = useContentLanguage();
  const routeEpisodeId = decodeURIComponent(
    episodeParamToString(params.episodeId),
  );
  const routeLanguageCode =
    episodeParamToString(params.lang) ||
    episodeParamToString(params.language) ||
    selectedLanguageCode;
  const feedQuery = usePodcastEpisodes();
  const player = usePodcastPlayer();
  const { progress } = useEpisodeProgress();
  const feedEpisodes = feedQuery.data ?? [];
  const feedEpisode = findPodcastEpisodeById(feedEpisodes, routeEpisodeId);
  const detailQuery = usePodcastEpisode(
    routeEpisodeId,
    routeLanguageCode,
    feedEpisode === null && !feedQuery.isLoading,
  );
  const rawEpisode = feedEpisode ?? detailQuery.data ?? null;
  const episode =
    rawEpisode === null ? null : mergeEpisodeProgress(rawEpisode, progress);
  const episodes =
    feedEpisodes.length > 0 ? feedEpisodes : episode === null ? [] : [episode];
  const isLoading =
    feedQuery.isLoading || (feedEpisode === null && detailQuery.isLoading);
  const isError =
    feedEpisode === null && feedQuery.isError && detailQuery.isError;

  const handleEpisodeChanged = (nextEpisode: PodcastEpisode) => {
    router.replace(
      `/podcast/${encodeURIComponent(nextEpisode.localizationId)}?lang=${encodeURIComponent(nextEpisode.languageCode)}`,
    );
  };

  if (episode === null) {
    return (
      <View
        className="flex-1 bg-bg"
        style={{ paddingTop: Math.max(insets.top, 12) }}
      >
        <View className="flex-row items-center px-5 pb-3">
          <PodcastIconButton label="Back" onPress={() => router.back()}>
            <ChevronLeft size={20} strokeWidth={2} color="#d4c5a3" />
          </PodcastIconButton>
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
        <EpisodeMediaPlayer
          key={episode.localizationId}
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
