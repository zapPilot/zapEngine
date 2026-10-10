import { useEffect, useMemo, useState } from 'react';
import type { PodcastCompletionByLanguage } from '@/components/content/ContentLanguageSelector';
import {
  selectPlayUnheardTarget,
  selectPodcastLists,
} from '@/components/podcast/episodeListSelection';
import {
  CONTENT_LANGUAGE_OPTIONS,
  type ContentLanguageCode,
} from '@/config/contentLanguages';
import { useEpisodeSortDirection } from '@/hooks/useEpisodeSortDirection';
import {
  isPodcastSearchQueryValid,
  normalisePodcastSearchQuery,
  usePodcastCatalog,
  usePodcastEpisodeSearch,
  usePodcastEpisodes,
  type PodcastEpisodeSearchResult,
} from '@/integration/podcastFeed';
import {
  mergeEpisodeProgress,
  summariseCatalogCompletion,
  type PodcastCompletionSummary,
} from '@/integration/podcastProgress';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';
import { useEpisodeProgress } from '@/providers/PodcastProgressProvider';
import { usePodcastPlayerStatus } from '@/providers/PodcastPlayerProvider';
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

export function usePodcastLibrary() {
  const player = usePodcastPlayerStatus();
  const { languageCode, t } = useContentLanguage();
  const {
    progress,
    isHydrated: progressIsHydrated,
    markAllListened,
  } = useEpisodeProgress();

  const [searchQuery, setSearchQuery] = useState('');
  const [searchExpanded, setSearchExpanded] = useState(false);
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 300);
  const { direction, setDirection } = useEpisodeSortDirection();
  const [visibleListened, setVisibleListened] = useState(LISTENED_PAGE_SIZE);
  const [confirmMarkAll, setConfirmMarkAll] = useState(false);

  const feedQuery = usePodcastEpisodes();
  const catalogQuery = usePodcastCatalog();
  const searchQueryResult = usePodcastEpisodeSearch(debouncedSearchQuery);

  const normalisedSearchQuery = normalisePodcastSearchQuery(searchQuery);
  const searchActive = isPodcastSearchQueryValid(normalisedSearchQuery);
  const searchPending =
    searchActive && debouncedSearchQuery.trim() !== normalisedSearchQuery;
  const searchResults = searchQueryResult.data ?? EMPTY_SEARCH_RESULTS;
  const refreshing =
    feedQuery.isRefetching ||
    catalogQuery.isRefetching ||
    (searchActive && searchQueryResult.isRefetching);

  const refreshPodcastData = async () => {
    await Promise.all([
      feedQuery.refetch(),
      catalogQuery.refetch(),
      searchActive ? searchQueryResult.refetch() : Promise.resolve(),
    ]);
  };

  const mergedEpisodes = useMemo(
    () =>
      (feedQuery.data ?? []).map((episode) =>
        mergeEpisodeProgress(episode, progress),
      ),
    [feedQuery.data, progress],
  );

  // Selected-language lists: unheard follows the direction toggle,
  // listened is always newest-first. The language dropdown is the single
  // language selector, so the list below only ever shows one language.
  const { unheard: unheardEpisodes, listened: listenedEpisodes } = useMemo(
    () => selectPodcastLists(mergedEpisodes, direction),
    [direction, mergedEpisodes],
  );

  const completionByLanguage = useMemo<
    PodcastCompletionByLanguage | undefined
  >(() => {
    if (!progressIsHydrated || catalogQuery.data === undefined) {
      return undefined;
    }
    const summaries: Partial<
      Record<ContentLanguageCode, PodcastCompletionSummary>
    > = {};
    for (const option of CONTENT_LANGUAGE_OPTIONS) {
      const catalogIds = catalogQuery.data.languages[option.code];
      if (catalogIds === undefined) continue;
      summaries[option.code] = summariseCatalogCompletion(catalogIds, progress);
    }
    return summaries;
  }, [catalogQuery.data, progress, progressIsHydrated]);

  const selectedLocalizationIds = useMemo(
    () => [
      ...new Set([
        ...(catalogQuery.data?.languages[languageCode] ?? []),
        ...mergedEpisodes.map((episode) => episode.localizationId),
      ]),
    ],
    [catalogQuery.data, languageCode, mergedEpisodes],
  );

  // "Play unheard" target + queue, prioritising the selected language
  // (mirrors the mobile `playSmart`: in-progress → unplayed → all completed).
  const playback = useMemo(
    () => selectPlayUnheardTarget(mergedEpisodes, direction),
    [direction, mergedEpisodes],
  );

  const playbackTarget = playback.target;
  const playbackIsPlaying =
    player.isPlaying &&
    playbackTarget !== null &&
    player.nowPlaying?.localizationId === playbackTarget.localizationId;

  const listLoading =
    !progressIsHydrated ||
    (searchActive
      ? (searchQueryResult.isPending || searchPending) &&
        searchResults.length === 0
      : feedQuery.isPending);
  const listError = searchActive
    ? searchQueryResult.isError
    : feedQuery.isError;

  const hasAnyEpisode =
    unheardEpisodes.length > 0 || listenedEpisodes.length > 0;
  const visibleCompletionByLanguage =
    completionByLanguage ??
    (progressIsHydrated && catalogQuery.isError
      ? EMPTY_COMPLETION_BY_LANGUAGE
      : undefined);
  const markAllReady = progressIsHydrated && !catalogQuery.isPending;

  const cancelSearch = () => {
    setSearchQuery('');
    setSearchExpanded(false);
  };

  return {
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
  };
}
