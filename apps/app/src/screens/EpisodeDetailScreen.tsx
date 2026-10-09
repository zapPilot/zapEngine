import { Icon } from '@/components/ui/Icon';
import { podcastEpisodeHref } from '@/integration/podcastRoutes';
import { EpisodeDownloadButton } from '@/components/podcast/EpisodeDownloadButton';
import { OpenEpisodeInApp } from '@/components/podcast/OpenEpisodeInApp';
import { EpisodeDownloadStatus } from '@/components/podcast/EpisodeDownloadStatus';
import { downloadedEpisodeRows } from '@/integration/podcastVideoDownloads';
import { usePodcastDownloads } from '@/providers/PodcastDownloadsProvider';
import { useRouter } from 'expo-router';
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
import { usePodcastEpisodeRoute } from '@/hooks/usePodcastEpisodeRoute';
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
    <View className="flex-row items-center justify-between pb-3">
      <View className="flex-row items-center gap-3">
        <PodcastIconButton label={t('common.back')} onPress={onBack}>
          <Icon icon={ChevronLeft} size="md" tone="sign" />
        </PodcastIconButton>
        <PodcastLanguageDropdown onLanguageSelected={onLanguageSelected} />
      </View>
      <Text className="min-w-0 flex-1 px-3 text-center font-text-semibold text-body text-ink">
        {t('podcast.title')}
      </Text>
      <View className="flex-row items-center gap-2">
        <EpisodeDownloadButton episode={episode} />
        <PodcastIconButton
          label={t('podcast.shareEpisode')}
          onPress={shareEpisode}
        >
          <Icon icon={Share2} size="md" tone="sign" />
        </PodcastIconButton>
      </View>
    </View>
  );
}

function EpisodeHeroCard({ episode }: { episode: PodcastEpisode }) {
  const { t } = useContentLanguage();
  const date = formatPodcastEpisodeDate(episode.createdAt, 'long');

  return (
    <Card className="overflow-hidden p-5">
      <View className="absolute -right-7 top-5 h-28 w-28 rounded-round border border-rule-2 bg-well" />
      <Text className="font-text-semibold text-title leading-[31px] text-ink">
        {episode.title}
      </Text>
      <View className="mt-4 flex-row flex-wrap items-center gap-2">
        {date !== '' ? (
          <Text className="font-mono text-data uppercase tracking-[1px] text-ink-3">
            {date}
          </Text>
        ) : null}
        <Text className="font-mono text-data uppercase tracking-[1px] text-ink-3">
          {episode.listened ? t('podcast.listened') : t('podcast.unheard')}
        </Text>
        {episode.likeCount > 0 ? (
          <Text className="font-mono text-data uppercase tracking-[1px] text-ink-3">
            {episode.likeCount} likes
          </Text>
        ) : null}
      </View>
      <EpisodeDownloadStatus episode={episode} />
    </Card>
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
    <View className="pt-7">
      <Text className="font-text-semibold text-body-lg text-ink">
        {t('podcast.languageClassroom')}
      </Text>
      <View className="mt-3 gap-3">
        {lessons.map((lesson) => (
          <Card
            key={`${lesson.targetLanguageCode}-${lesson.oneLiner}`}
            className="p-4"
          >
            <View className="flex-row items-start gap-3">
              <View className="rounded-round border border-rule-2 bg-well px-3 py-1">
                <Text className="font-mono text-data font-text-semibold text-ink">
                  {contentLanguageBadge(lesson.targetLanguageCode)}
                </Text>
              </View>
              <Text className="min-w-0 flex-1 font-text-semibold text-body-sm leading-[19px] text-ink">
                {lesson.oneLiner}
              </Text>
            </View>
            <View className="mt-4 flex-row flex-wrap gap-2">
              {lesson.keywords.map((keyword) => (
                <View
                  key={`${keyword.term}-${keyword.meaning}`}
                  className="max-w-[260px] rounded-panel bg-well px-3 py-2"
                >
                  <Text className="font-text-semibold text-body-sm text-ink">
                    {keyword.term}
                  </Text>
                  <Text className="font-mono-medium mt-1 text-label leading-[15px] text-ink-2">
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
    <View className="pt-4" accessibilityRole="progressbar">
      <SkeletonBlock className="h-[210px] rounded-sheet" />
      <SkeletonBlock className="mt-5 h-[210px] rounded-sheet" />
      <SkeletonBlock className="mt-7 h-5 w-32" />
      <SkeletonBlock className="mt-3 h-40 rounded-panel" />
    </View>
  );
}

export function EpisodeDetailScreen() {
  const router = useRouter();
  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/listen');
    }
  };
  const insets = useSafeAreaInsets();
  const { languageCode: selectedLanguageCode, t } = useContentLanguage();
  const [activeVideoClock, setActiveVideoClock] =
    useState<EpisodeMediaClock | null>(null);
  const {
    episodeId: routeEpisodeId,
    languageCode: routeLanguageCode,
    mediaTab,
  } = usePodcastEpisodeRoute(selectedLanguageCode);
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
  // A shared URL carries an explicit language that wins over the receiver's
  // current global feed language. `findPodcastEpisodeById` matches both
  // canonical and localization IDs, so a canonical ID from an inbound
  // Universal Link can match the same episode in the wrong-language feed.
  // Only reuse the feed episode when its language agrees with the route;
  // otherwise fall through to `routeEpisodeId` + `routeLanguageCode`, which
  // the backend resolves as the requested localization.
  const candidateFeedEpisode = findPodcastEpisodeById(
    feedEpisodes,
    routeEpisodeId,
  );
  const feedEpisode =
    candidateFeedEpisode !== null &&
    (routeLanguageCode === '' ||
      candidateFeedEpisode.languageCode === routeLanguageCode)
      ? candidateFeedEpisode
      : null;
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
      podcastEpisodeHref(nextEpisode.localizationId, nextEpisode.languageCode),
    );
  };

  if (episode === null) {
    return (
      <ScreenScrollView width="reading" bottomPadding={36 + insets.bottom}>
        <View className="flex-row items-center pb-3">
          <PodcastIconButton label={t('common.back')} onPress={goBack}>
            <Icon icon={ChevronLeft} size="md" tone="sign" />
          </PodcastIconButton>
        </View>
        {isLoading ? (
          <DetailSkeleton />
        ) : (
          <View className="pt-4">
            <Card className="p-5">
              <Text className="font-text-semibold text-body-lg text-ink">
                {isError
                  ? t('podcast.episodeUnavailable')
                  : 'Episode not found'}
              </Text>
              <Text className="font-text mt-2 text-body-sm leading-5 text-ink-2">
                {isError
                  ? t('podcast.episodeUnavailableMessage')
                  : 'This episode is not in the current language feed.'}
              </Text>
            </Card>
          </View>
        )}
      </ScreenScrollView>
    );
  }

  const handleLanguageSelected = (code: ContentLanguageCode) => {
    if (code === routeLanguageCode) return;
    router.replace(podcastEpisodeHref(episode.id, code));
  };

  const mediaKey = `${episode.localizationId}:${mediaTab ?? 'default'}`;
  return (
    <View className="flex-1 bg-ground">
      <ScreenScrollView width="reading" bottomPadding={36 + insets.bottom}>
        <EpisodeDetailHeader
          episode={episode}
          onBack={goBack}
          onLanguageSelected={handleLanguageSelected}
        />
        <OpenEpisodeInApp
          localizationId={episode.localizationId}
          languageCode={episode.languageCode}
        />
        <EpisodeHeroCard episode={episode} />
        {mediaTab === 'transcript' ? (
          <EpisodeTranscript
            episode={episode}
            player={player}
            activeVideoClock={activeVideoClock}
          />
        ) : null}
        <EpisodeMediaPlayer
          key={mediaKey}
          {...(mediaTab === undefined
            ? {}
            : { initialTab: mediaTab === 'transcript' ? 'story' : mediaTab })}
          episode={episode}
          episodes={episodes}
          player={player}
          onEpisodeChanged={handleEpisodeChanged}
          onVideoClockChange={setActiveVideoClock}
        />
        <LanguageClassroomSection lessons={episode.languageClassrooms} />
        {mediaTab !== 'transcript' ? (
          <EpisodeTranscript
            episode={episode}
            player={player}
            activeVideoClock={activeVideoClock}
          />
        ) : null}
      </ScreenScrollView>
    </View>
  );
}
