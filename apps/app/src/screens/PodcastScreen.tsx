import { useRouter } from 'expo-router';
import { Search, X } from 'lucide-react-native';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import {
  PodcastLanguageDropdown,
  type PodcastCompletionByLanguage,
} from '@/components/content/ContentLanguageSelector';
import { EpisodeRow } from '@/components/podcast/EpisodeRow';
import { ExpandableSection } from '@/components/podcast/ExpandableSection';
import {
  selectPlayUnheardTarget,
  selectPodcastLists,
} from '@/components/podcast/episodeListSelection';
import { PlayUnheardCard } from '@/components/podcast/PlayUnheardCard';
import { NowPlayingBar } from '@/components/podcast/NowPlayingBar';
import type { EpisodeSortDirection } from '@/components/podcast/episodeSorting';
import { Card } from '@/components/ui/Card';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { ScreenScrollView } from '@/components/ui/ScreenScrollView';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import { Tap } from '@/components/ui/Tap';
import {
  CONTENT_LANGUAGE_OPTIONS,
  type ContentLanguageCode,
} from '@/config/contentLanguages';
import {
  isPodcastSearchQueryValid,
  normalisePodcastSearchQuery,
  usePodcastEpisodeSearch,
  usePodcastEpisodesByLanguage,
} from '@/integration/podcastFeed';
import type {
  PodcastEpisode,
  PodcastEpisodeSearchResult,
} from '@/integration/podcastFeed';
import {
  mergeEpisodeProgress,
  type PodcastCompletionSummary,
  summarisePodcastCompletion,
} from '@/integration/podcastProgress';
import { cn } from '@/lib/cn';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';
import { useEpisodeProgress } from '@/providers/PodcastProgressProvider';
import { usePodcastPlayer } from '@/providers/PodcastPlayerProvider';

const EMPTY_SEARCH_RESULTS: readonly PodcastEpisodeSearchResult[] = [];
const EMPTY_COMPLETION_BY_LANGUAGE: PodcastCompletionByLanguage = {};
const LISTENED_PAGE_SIZE = 12;

function useDebouncedValue(value: string, delayMs: number): string {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs, value]);

  return debouncedValue;
}

function EpisodeListSkeleton() {
  return (
    <View className="px-5" accessibilityRole="progressbar">
      {[0, 1, 2, 3].map((item) => (
        <View
          key={item}
          className={cn(
            'flex-row gap-3 py-[13px]',
            item !== 0 && 'border-t border-line',
          )}
        >
          <SkeletonBlock className="h-10 w-10 rounded-xl" />
          <View className="min-w-0 flex-1">
            <View className="flex-row items-center justify-between gap-2">
              <SkeletonBlock className="h-4 w-44" />
              <SkeletonBlock className="h-8 w-8 rounded-full" />
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
      <View className="self-start rounded-full bg-[rgba(212,197,163,.12)] px-2 py-1">
        <Text className="font-mono text-[9px] uppercase tracking-[0.8px] text-accent">
          {result.matchSource === 'title'
            ? t('podcast.matchTitle')
            : t('podcast.matchTranscript')}
        </Text>
      </View>
      {snippet !== undefined && snippet !== '' ? (
        <Text
          className="mt-[7px] text-[12px] leading-[17px] text-ink-dim"
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
    <View className="flex-row items-center gap-3 px-5 pt-3">
      <View className="h-11 min-w-0 flex-1 flex-row items-center gap-3 rounded-[18px] border border-line bg-[rgba(255,255,255,.045)] px-3">
        <Search size={18} strokeWidth={2} color="#a1a1aa" />
        <TextInput
          accessibilityLabel={t('podcast.searchEpisodes')}
          autoFocus
          value={query}
          onChangeText={onChangeQuery}
          placeholder={t('podcast.searchPlaceholder')}
          placeholderTextColor="#71717a"
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
          className="h-full min-w-0 flex-1 font-sans text-[14px] text-ink"
        />
        {query.trim() !== '' ? (
          <Tap
            accessibilityRole="button"
            accessibilityLabel={t('podcast.clearSearch')}
            onPress={onClear}
            className="h-7 w-7 items-center justify-center rounded-full bg-[rgba(255,255,255,.06)]"
          >
            <X size={14} strokeWidth={2} color="#a1a1aa" />
          </Tap>
        ) : null}
      </View>
      <Tap
        accessibilityRole="button"
        accessibilityLabel={t('podcast.cancelSearch')}
        onPress={onCancel}
        className="h-11 items-center justify-center px-1"
      >
        <Text className="font-sans-medium text-[13px] text-accent">
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
    <View className="px-5 pt-[18px]">
      <Card className="p-5">
        <Text className="font-sans-semibold text-[15px] text-ink">{title}</Text>
        <Text className="mt-2 text-[12.5px] leading-[19px] text-ink-dim">
          {message}
        </Text>
      </Card>
    </View>
  );
}

export function PodcastScreen() {
  const router = useRouter();
  const player = usePodcastPlayer();
  const { languageCode, t } = useContentLanguage();
  const { progress, markAllListened } = useEpisodeProgress();

  const [searchQuery, setSearchQuery] = useState('');
  const [searchExpanded, setSearchExpanded] = useState(false);
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 300);
  const [direction, setDirection] = useState<EpisodeSortDirection>('newest');
  const [visibleListened, setVisibleListened] = useState(LISTENED_PAGE_SIZE);
  const [confirmMarkAll, setConfirmMarkAll] = useState(false);
  // The non-selected languages only feed the dropdown's completion
  // percentages, so their requests wait until the dropdown first opens.
  const [allLanguagesRequested, setAllLanguagesRequested] = useState(false);

  const feedQuery = usePodcastEpisodesByLanguage(
    languageCode,
    allLanguagesRequested,
  );
  const searchQueryResult = usePodcastEpisodeSearch(debouncedSearchQuery);

  const normalisedSearchQuery = normalisePodcastSearchQuery(searchQuery);
  const searchActive = isPodcastSearchQueryValid(normalisedSearchQuery);
  const searchPending =
    searchActive && debouncedSearchQuery.trim() !== normalisedSearchQuery;
  const searchResults = searchQueryResult.data ?? EMPTY_SEARCH_RESULTS;

  // Merge device-local progress onto each language's feed.
  const mergedByLanguage = useMemo(() => {
    const result: Record<string, PodcastEpisode[]> = {};
    for (const option of CONTENT_LANGUAGE_OPTIONS) {
      result[option.code] = (feedQuery.byLanguage[option.code] ?? []).map(
        (episode) => mergeEpisodeProgress(episode, progress),
      );
    }
    return result;
  }, [feedQuery.byLanguage, progress]);

  // Selected-language lists: unheard follows the direction toggle,
  // listened is always newest-first. The language dropdown is the single
  // language selector, so the list below only ever shows one language.
  const { unheard: unheardEpisodes, listened: listenedEpisodes } = useMemo(
    () => selectPodcastLists(mergedByLanguage, languageCode, direction),
    [mergedByLanguage, languageCode, direction],
  );

  const completionByLanguage = useMemo<PodcastCompletionByLanguage>(() => {
    const summaries: Partial<
      Record<ContentLanguageCode, PodcastCompletionSummary>
    > = {};
    for (const option of CONTENT_LANGUAGE_OPTIONS) {
      // An unfetched language stays undefined so the dropdown renders its
      // existing "no percentage" state instead of a misleading 0%.
      if (feedQuery.byLanguage[option.code] === undefined) {
        continue;
      }
      summaries[option.code] = summarisePodcastCompletion(
        mergedByLanguage[option.code] ?? [],
      );
    }
    return summaries;
  }, [feedQuery.byLanguage, mergedByLanguage]);

  const allLocalizationIds = useMemo(
    () =>
      CONTENT_LANGUAGE_OPTIONS.flatMap((option) =>
        (mergedByLanguage[option.code] ?? []).map(
          (episode) => episode.localizationId,
        ),
      ),
    [mergedByLanguage],
  );

  // "Play unheard" target + queue, prioritising the selected language
  // (mirrors the mobile `playSmart`: in-progress → unplayed → all completed).
  const playback = useMemo(
    () =>
      selectPlayUnheardTarget(mergedByLanguage[languageCode] ?? [], direction),
    [mergedByLanguage, languageCode, direction],
  );

  const playbackTarget = playback.target;
  const playbackIsPlaying =
    player.isPlaying &&
    playbackTarget !== null &&
    player.nowPlaying?.localizationId === playbackTarget.localizationId;

  const listLoading = searchActive
    ? (searchQueryResult.isLoading || searchPending) &&
      searchResults.length === 0
    : feedQuery.isLoading;
  const listError = searchActive
    ? searchQueryResult.isError
    : feedQuery.isError;

  const hasAnyEpisode =
    unheardEpisodes.length > 0 || listenedEpisodes.length > 0;
  const visibleCompletionByLanguage =
    feedQuery.isLoading || feedQuery.isError
      ? EMPTY_COMPLETION_BY_LANGUAGE
      : completionByLanguage;

  const cancelSearch = () => {
    setSearchQuery('');
    setSearchExpanded(false);
  };

  const openEpisode = (episode: PodcastEpisode) =>
    router.push(
      `/podcast/${encodeURIComponent(episode.localizationId)}?lang=${encodeURIComponent(episode.languageCode)}`,
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
      const searchEpisodes = searchResults.map((result) => result.episode);
      return (
        <View className="px-5">
          {renderRows(searchEpisodes, searchEpisodes, (_episode, index) => (
            <SearchMatchSummary result={searchResults[index]!} />
          ))}
        </View>
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
        <PlayUnheardCard
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
              <Tap
                accessibilityRole="button"
                accessibilityLabel={t('podcast.loadMoreListened')}
                onPress={() =>
                  setVisibleListened((current) => current + LISTENED_PAGE_SIZE)
                }
                className="mt-2 items-center rounded-full border border-line py-[10px]"
              >
                <Text className="font-mono text-[11px] uppercase tracking-[0.8px] text-ink-dim">
                  {t('podcast.loadMore')}
                </Text>
              </Tap>
            ) : null}
          </ExpandableSection>
        ) : null}

        <View className="items-center px-5 pb-2 pt-6">
          <Tap
            accessibilityRole="button"
            accessibilityLabel={t('podcast.markAllListened')}
            onPress={() => {
              if (confirmMarkAll) {
                markAllListened(allLocalizationIds);
                setConfirmMarkAll(false);
              } else {
                setConfirmMarkAll(true);
              }
            }}
            className="px-3 py-1"
          >
            <Text className="font-mono text-[10px] text-ink-faint">
              {confirmMarkAll
                ? t('podcast.confirmMarkAllListened')
                : t('podcast.markAllListened')}
            </Text>
          </Tap>
        </View>
      </View>
    );
  };

  return (
    <View className="flex-1 bg-bg">
      <ScreenScrollView bottomPadding={player.nowPlaying === null ? 24 : 108}>
        <ScreenHeader
          title={t('podcast.title')}
          left={
            <PodcastLanguageDropdown
              completionByLanguage={visibleCompletionByLanguage}
              onOpen={() => setAllLanguagesRequested(true)}
            />
          }
          right={
            <Tap
              accessibilityRole="button"
              accessibilityLabel={t('podcast.searchEpisodes')}
              accessibilityState={{ expanded: searchExpanded }}
              onPress={() => setSearchExpanded(true)}
              className={cn(
                'h-11 w-11 items-center justify-center rounded-full border',
                searchExpanded
                  ? 'border-[rgba(212,197,163,.42)] bg-[rgba(212,197,163,.16)]'
                  : 'border-line bg-[rgba(255,255,255,.045)]',
              )}
            >
              <Search
                size={19}
                strokeWidth={2}
                color={searchExpanded ? '#d4c5a3' : '#a1a1aa'}
              />
            </Tap>
          }
        />

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
          <View className="mx-5 mt-3 h-[2px] overflow-hidden rounded-full bg-line">
            <View className="h-full w-1/2 rounded-full bg-accent" />
          </View>
        ) : null}

        {renderEpisodeContent()}
      </ScreenScrollView>

      <NowPlayingBar player={player} onOpen={openEpisode} />
    </View>
  );
}
