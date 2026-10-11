import { usePodcastLibrary } from '@/components/listen/usePodcastLibrary';
import { ListenNowPlayingCard } from '@/components/listen/ListenNowPlayingCard';
import { TextField } from '@/components/ui/TextField';
import { palette } from '@/lib/palette';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { podcastEpisodeHref } from '@/integration/podcastRoutes';
import { useRouter } from 'expo-router';
import { Search, X } from 'lucide-react-native';
import { type ReactNode } from 'react';
import { RefreshControl, View } from 'react-native';

import { PodcastLanguageDropdown } from '@/components/content/ContentLanguageSelector';
import { DownloadedEpisodesSection } from '@/components/podcast/DownloadedEpisodesSection';
import { EpisodeRow } from '@/components/podcast/EpisodeRow';
import { ExpandableSection } from '@/components/podcast/ExpandableSection';
import { PlayUnheardButton } from '@/components/listen/PlayUnheardButton';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { ScreenScrollView } from '@/components/ui/ScreenScrollView';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import { Tap } from '@/components/ui/Tap';
import type {
  PodcastEpisode,
  PodcastEpisodeSearchResult,
} from '@/integration/podcastFeed';
import { mergeEpisodeProgress } from '@/integration/podcastProgress';
import { cn } from '@/lib/cn';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';

function EpisodeListSkeleton() {
  return (
    <View accessibilityRole="progressbar">
      {[0, 1, 2, 3].map((item) => (
        <View
          key={item}
          className={cn(
            'flex-row gap-3 py-[13px]',
            item !== 0 && 'border-t border-rule',
          )}
        >
          <SkeletonBlock className="h-10 w-10 rounded-panel" />
          <View className="min-w-0 flex-1">
            <View className="flex-row items-center justify-between gap-2">
              <SkeletonBlock className="h-4 w-44" />
              <SkeletonBlock className="h-8 w-8 rounded-round" />
            </View>
            <SkeletonBlock className="mt-[9px] h-3 w-16" />
          </View>
        </View>
      ))}
    </View>
  );
}

function SearchMatchSummary({
  result,
}: {
  result: PodcastEpisodeSearchResult;
}) {
  const { t } = useContentLanguage();
  const snippet = result.snippet?.trim();

  return (
    <View className="mt-2">
      <View className="self-start rounded-round bg-well px-2 py-1">
        <Text className="font-mono text-data uppercase tracking-[0.8px] text-ink">
          {result.matchSource === 'title'
            ? t('podcast.matchTitle')
            : t('podcast.matchTranscript')}
        </Text>
      </View>
      {snippet !== undefined && snippet !== '' ? (
        <Text
          className="font-text mt-[7px] text-caption leading-[17px] text-ink-2"
          numberOfLines={3}
        >
          {snippet}
        </Text>
      ) : null}
    </View>
  );
}

function PodcastSearchBar({
  query,
  onChangeQuery,
  onClear,
  onCancel,
}: {
  query: string;
  onChangeQuery: (query: string) => void;
  onClear: () => void;
  onCancel: () => void;
}) {
  const { t } = useContentLanguage();

  return (
    <View className="flex-row items-center gap-3 pt-3">
      <View className="min-w-0 flex-1 flex-row items-center gap-3">
        <Icon icon={Search} size="md" tone="secondary" />
        <TextField
          label={t('podcast.searchEpisodes')}
          autoFocus
          value={query}
          onChangeText={onChangeQuery}
          placeholder={t('podcast.searchPlaceholder')}
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
          className="min-w-0 flex-1"
        />
        {query.trim() !== '' ? (
          <Tap
            accessibilityRole="button"
            accessibilityLabel={t('podcast.clearSearch')}
            onPress={onClear}
            className="h-7 w-7 items-center justify-center rounded-round bg-well"
          >
            <Icon icon={X} size="xs" tone="secondary" />
          </Tap>
        ) : null}
      </View>
      <Tap
        accessibilityRole="button"
        accessibilityLabel={t('podcast.cancelSearch')}
        onPress={onCancel}
        className="h-11 items-center justify-center px-1"
      >
        <Text className="font-text-medium text-body-sm text-ink">
          {t('common.cancel')}
        </Text>
      </Tap>
    </View>
  );
}

function EmptyStateCard({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <View className="pt-[18px]">
      <Card className="p-5">
        <Text className="font-text-semibold text-body text-ink">{title}</Text>
        <Text className="font-text mt-2 text-caption leading-[19px] text-ink-2">
          {message}
        </Text>
      </Card>
    </View>
  );
}

export function ListenScreen() {
  const router = useRouter();
  const {
    player,
    t,
    progress,
    searchQuery,
    setSearchQuery,
    searchExpanded,
    setSearchExpanded,
    direction,
    setDirection,
    visibleListened,
    setVisibleListened,
    confirmMarkAll,
    setConfirmMarkAll,
    searchQueryResult,
    normalisedSearchQuery,
    searchActive,
    searchResults,
    refreshing,
    refreshPodcastData,
    unheardEpisodes,
    listenedEpisodes,
    playback,
    playbackTarget,
    playbackIsPlaying,
    listLoading,
    listError,
    hasAnyEpisode,
    visibleCompletionByLanguage,
    markAllReady,
    selectedLocalizationIds,
    markAllListened,
    cancelSearch,
  } = usePodcastLibrary();
  const openEpisode = (
    episode: Pick<PodcastEpisode, 'localizationId' | 'languageCode'>,
  ) =>
    router.push(
      podcastEpisodeHref(episode.localizationId, episode.languageCode),
    );

  const renderRows = (
    episodes: readonly PodcastEpisode[],
    context: readonly PodcastEpisode[],
    supporting?: (episode: PodcastEpisode, index: number) => ReactNode,
  ) =>
    episodes.map((episode, index) => {
      const active =
        player.nowPlaying?.localizationId === episode.localizationId;
      return (
        <EpisodeRow
          key={episode.localizationId}
          episode={episode}
          first={index === 0}
          active={active}
          playing={active && player.isPlaying}
          supportingContent={supporting?.(episode, index)}
          onToggle={() => player.playFromQueue(context, episode)}
          onOpen={() => openEpisode(episode)}
        />
      );
    });

  const downloadedSection = (
    <DownloadedEpisodesSection
      direction={direction}
      onOpenEpisode={openEpisode}
    />
  );

  const renderEpisodeContent = () => {
    if (normalisedSearchQuery !== '' && !searchActive) {
      return (
        <EmptyStateCard
          title={t('podcast.searchPromptTitle')}
          message={t('podcast.searchPromptMessage')}
        />
      );
    }
    if (listLoading) {
      return <EpisodeListSkeleton />;
    }
    if (listError) {
      return (
        <EmptyStateCard
          title={
            searchActive
              ? t('podcast.searchUnavailableTitle')
              : t('podcast.feedUnavailableTitle')
          }
          message={
            searchActive
              ? t('podcast.searchUnavailableMessage')
              : t('podcast.feedUnavailableMessage')
          }
        />
      );
    }
    if (searchActive) {
      if (searchResults.length === 0) {
        return (
          <EmptyStateCard
            title={t('podcast.noSearchResultsTitle')}
            message={t('podcast.noSearchResultsMessage')}
          />
        );
      }
      const searchEpisodes = searchResults.map((result) =>
        mergeEpisodeProgress(result.episode, progress),
      );
      return (
        <>
          {renderRows(searchEpisodes, searchEpisodes, (_episode, index) => (
            <SearchMatchSummary result={searchResults[index]!} />
          ))}
        </>
      );
    }
    if (!hasAnyEpisode) {
      return (
        <EmptyStateCard
          title={t('podcast.noEpisodesTitle')}
          message={t('podcast.noEpisodesMessage')}
        />
      );
    }
    return (
      <View>
        <PlayUnheardButton
          activeEpisode={player.nowPlaying}
          mode={playback.mode}
          target={playbackTarget}
          direction={direction}
          isPlaying={playbackIsPlaying}
          onDirectionChange={setDirection}
          onPlay={() => {
            if (playbackTarget !== null) {
              player.playFromQueue(playback.queue, playbackTarget);
            }
          }}
          onOpen={() => {
            if (playbackTarget !== null) {
              openEpisode(playbackTarget);
            }
          }}
        />

        {unheardEpisodes.length > 0 ? (
          <ExpandableSection
            title={t('podcast.unheard')}
            count={unheardEpisodes.length}
            defaultExpanded
          >
            {renderRows(unheardEpisodes, unheardEpisodes)}
          </ExpandableSection>
        ) : null}

        {listenedEpisodes.length > 0 ? (
          <ExpandableSection
            title={t('podcast.listened')}
            count={listenedEpisodes.length}
          >
            {renderRows(
              listenedEpisodes.slice(0, visibleListened),
              listenedEpisodes,
            )}
            {visibleListened < listenedEpisodes.length ? (
              <Button
                variant="secondary"
                size="sm"
                accessibilityLabel={t('podcast.loadMoreListened')}
                onPress={() => setVisibleListened((current) => current + 12)}
                className="mt-2"
              >
                {t('podcast.loadMore')}
              </Button>
            ) : null}
          </ExpandableSection>
        ) : null}

        {downloadedSection}

        <View className="items-center pb-2 pt-6">
          <Button
            variant="ghost"
            size="sm"
            accessibilityLabel={t('podcast.markAllListened')}
            accessibilityState={{ disabled: !markAllReady }}
            disabled={!markAllReady}
            onPress={() => {
              if (!markAllReady) return;
              if (confirmMarkAll) {
                markAllListened(selectedLocalizationIds);
                setConfirmMarkAll(false);
              } else {
                setConfirmMarkAll(true);
              }
            }}
            className="min-h-hit"
          >
            <Text variant="caption" tone="muted">
              {confirmMarkAll
                ? t('podcast.confirmMarkAllListened')
                : t('podcast.markAllListened')}
            </Text>
          </Button>
        </View>
      </View>
    );
  };

  return (
    <View className="flex-1 bg-ground">
      <ScreenScrollView
        width="reading"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              void refreshPodcastData();
            }}
            tintColor={palette.ink}
            colors={[palette.ink]}
            progressBackgroundColor={palette.well}
          />
        }
      >
        <PageHeader
          title={t('tabs.listen')}
          actions={
            <View className="flex-row items-center gap-2">
              <PodcastLanguageDropdown
                completionByLanguage={visibleCompletionByLanguage ?? {}}
              />
              <Tap
                accessibilityRole="button"
                accessibilityLabel={t('podcast.searchEpisodes')}
                accessibilityState={{ expanded: searchExpanded }}
                onPress={() => setSearchExpanded(true)}
                className={cn(
                  'h-11 w-11 items-center justify-center rounded-round border',
                  searchExpanded
                    ? 'border-rule-2 bg-well'
                    : 'border-rule bg-well',
                )}
              >
                <Icon icon={Search} size="md" tone="secondary" />
              </Tap>
            </View>
          }
        />

        <ListenNowPlayingCard />

        {searchExpanded ? (
          <PodcastSearchBar
            query={searchQuery}
            onChangeQuery={setSearchQuery}
            onClear={() => setSearchQuery('')}
            onCancel={cancelSearch}
          />
        ) : null}

        {searchActive &&
        searchQueryResult.isFetching &&
        searchResults.length > 0 ? (
          <ProgressBar
            height={2}
            className="mt-3"
            accessibilityLabel={t('podcast.searching')}
          />
        ) : null}

        {normalisedSearchQuery !== '' ||
        listLoading ||
        listError ||
        !hasAnyEpisode
          ? downloadedSection
          : null}
        {renderEpisodeContent()}
      </ScreenScrollView>
    </View>
  );
}
