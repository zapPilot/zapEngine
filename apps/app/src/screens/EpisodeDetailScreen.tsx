import { EpisodeDownloadButton } from '@/components/podcast/EpisodeDownloadButton';
import { downloadedEpisodeRows } from '@/integration/podcastVideoDownloads';
import { usePodcastDownloads } from '@/providers/PodcastDownloadsProvider';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft, Share2 } from 'lucide-react-native';
import { useState } from 'react';
import { Share, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PodcastLanguageDropdown } from '@/components/content/ContentLanguageSelector';
import {
  EpisodeMediaPlayer,
  PodcastIconButton,
} from '@/components/podcast/EpisodeMediaPlayer';
import { formatPodcastEpisodeDate } from '@/components/podcast/episodeFormatters';
import { EpisodeTranscript } from '@/components/podcast/EpisodeTranscript';
import { Card } from '@/components/ui/Card';
import { ScreenScrollView } from '@/components/ui/ScreenScrollView';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import { contentLanguageBadge } from '@/config/contentLanguages';
import type { EpisodeMediaClock } from '@/integration/episodeMediaSync';
import {
  findPodcastEpisodeById,
  getPodcastEpisodeShareUrl,
  isPodcastVideoGenerationPending,
  mergePodcastEpisodeVideo,
  parsePodcastEpisodeRouteParams,
  usePodcastEpisode,
  usePodcastEpisodes,
} from '@/integration/podcastFeed';
import type {
  PodcastEpisode,
  PodcastLanguageClassroomKeyword,
  PodcastLanguageClassroomLesson,
} from '@/integration/podcastFeed';
import { mergeEpisodeProgress } from '@/integration/podcastProgress';
import { usePodcastPlayer } from '@/providers/PodcastPlayerProvider';
import { useEpisodeProgress } from '@/providers/PodcastProgressProvider';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';
import type { ContentLanguageCode } from '@/config/contentLanguages';

function EpisodeDetailHeader({
  episode,
  onBack,
  onLanguageSelected,
}: {
  episode: PodcastEpisode;
  onBack: () => void;
  onLanguageSelected: (code: ContentLanguageCode) => void;
}) {
  const { t } = useContentLanguage();
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
        <PodcastIconButton label={t('common.back')} onPress={onBack}>
          <ChevronLeft size={20} strokeWidth={2} color="#d4c5a3" />
        </PodcastIconButton>
        <PodcastLanguageDropdown onLanguageSelected={onLanguageSelected} />
      </View>
      <Text className="min-w-0 flex-1 px-3 text-center font-sans-semibold text-[14px] text-ink">
        Podcast
      </Text>
      <EpisodeDownloadButton episode={episode} />
      <PodcastIconButton label="Share episode" onPress={shareEpisode}>
        <Share2 size={18} strokeWidth={2} color="#d4c5a3" />
      </PodcastIconButton>
    </View>
  );
}

function EpisodeHeroCard({ episode }: { episode: PodcastEpisode }) {
  const { t } = useContentLanguage();
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
            {episode.listened ? t('podcast.listened') : t('podcast.unheard')}
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
  const { t } = useContentLanguage();
  if (lessons.length === 0) return null;

  return (
    <View className="px-5 pt-7">
      <Text className="font-sans-semibold text-[17px] text-ink">
        {t('podcast.languageClassroom')}
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
                  {contentLanguageBadge(lesson.targetLanguageCode)}
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
  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/podcast');
    }
  };
  const insets = useSafeAreaInsets();
  const { languageCode: selectedLanguageCode, t } = useContentLanguage();
  const [activeVideoClock, setActiveVideoClock] =
    useState<EpisodeMediaClock | null>(null);
  const { episodeId: routeEpisodeId, languageCode: routeLanguageCode } =
    parsePodcastEpisodeRouteParams(params, selectedLanguageCode);
  const downloads = usePodcastDownloads();
  const offlineEpisode =
    downloadedEpisodeRows(downloads.records, 'newest').find(
      (item) =>
        item.localizationId === routeEpisodeId ||
        (item.id === routeEpisodeId && item.languageCode === routeLanguageCode),
    ) ?? null;
  const feedQuery = usePodcastEpisodes();
  const player = usePodcastPlayer();
  const { progress, isHydrated: progressIsHydrated } = useEpisodeProgress();
  const feedEpisodes = feedQuery.data ?? [];
  const feedEpisode = findPodcastEpisodeById(feedEpisodes, routeEpisodeId);
  const isFeedVideoGenerationPending =
    isPodcastVideoGenerationPending(feedEpisode);
  const pendingFeedVideoGeneration = isFeedVideoGenerationPending
    ? (feedEpisode?.videoGeneration ?? null)
    : null;
  const detailQuery = usePodcastEpisode(
    feedEpisode?.localizationId ?? routeEpisodeId,
    feedEpisode?.languageCode ?? routeLanguageCode,
    !feedQuery.isPending,
    pendingFeedVideoGeneration,
  );
  const rawEpisode =
    mergePodcastEpisodeVideo(feedEpisode, detailQuery.data ?? null) ??
    offlineEpisode;
  const episode =
    rawEpisode === null ? null : mergeEpisodeProgress(rawEpisode, progress);
  const episodes =
    feedEpisodes.length > 0 ? feedEpisodes : episode === null ? [] : [episode];
  const isLoading =
    !downloads.isHydrated ||
    !progressIsHydrated ||
    feedQuery.isPending ||
    (feedEpisode === null && detailQuery.isPending);
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
          <PodcastIconButton label={t('common.back')} onPress={goBack}>
            <ChevronLeft size={20} strokeWidth={2} color="#d4c5a3" />
          </PodcastIconButton>
        </View>
        {isLoading ? (
          <DetailSkeleton />
        ) : (
          <View className="px-5 pt-4">
            <Card className="p-5">
              <Text className="font-sans-semibold text-[16px] text-ink">
                {isError
                  ? t('podcast.episodeUnavailable')
                  : 'Episode not found'}
              </Text>
              <Text className="mt-2 text-[13px] leading-5 text-ink-dim">
                {isError
                  ? t('podcast.episodeUnavailableMessage')
                  : 'This episode is not in the current language feed.'}
              </Text>
            </Card>
          </View>
        )}
      </View>
    );
  }

  const handleLanguageSelected = (code: ContentLanguageCode) => {
    if (code === routeLanguageCode) return;
    router.replace(
      `/podcast/${encodeURIComponent(episode.id)}?lang=${encodeURIComponent(code)}`,
    );
  };

  return (
    <View className="flex-1 bg-bg">
      <ScreenScrollView bottomPadding={36}>
        <EpisodeDetailHeader
          episode={episode}
          onBack={goBack}
          onLanguageSelected={handleLanguageSelected}
        />
        <EpisodeHeroCard episode={episode} />
        <EpisodeMediaPlayer
          key={episode.localizationId}
          episode={episode}
          episodes={episodes}
          player={player}
          onEpisodeChanged={handleEpisodeChanged}
          onVideoClockChange={setActiveVideoClock}
        />
        <LanguageClassroomSection lessons={episode.languageClassrooms} />
        <EpisodeTranscript
          episode={episode}
          player={player}
          activeVideoClock={activeVideoClock}
        />
      </ScreenScrollView>
    </View>
  );
}
