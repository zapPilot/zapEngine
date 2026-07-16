import Slider from '@react-native-community/slider';
import { useRouter } from 'expo-router';
import { Pause, Play, Search, X } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import {
  getContentLanguageBadge,
  PodcastLanguageDropdown,
  type PodcastCompletionByLanguage,
} from '@/components/content/ContentLanguageSelector';
import { formatPodcastClock } from '@/components/podcast/episodeFormatters';
import { EpisodeRow } from '@/components/podcast/EpisodeRow';
import { ExpandableSection } from '@/components/podcast/ExpandableSection';
import {
  PlayUnheardCard,
  type PlayUnheardMode,
} from '@/components/podcast/PlayUnheardCard';
import {
  type EpisodeSortDirection,
  sortEpisodes,
} from '@/components/podcast/episodeSorting';
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
  usePodcastEpisodesAllLanguages,
} from '@/integration/podcastFeed';
import type {
  PodcastEpisode,
  PodcastEpisodeSearchResult,
} from '@/integration/podcastFeed';
import {
  mergeEpisodeProgress,
  type PodcastCompletionSummary,
  resolveEpisodeStatus,
  summarisePodcastCompletion,
} from '@/integration/podcastProgress';
import type { PodcastPlayer } from '@/integration/podcastPlayerTypes';
import { cn } from '@/lib/cn';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';
import { useEpisodeProgress } from '@/providers/PodcastProgressProvider';
import { usePodcastPlayer } from '@/providers/PodcastPlayerProvider';

const EMPTY_SEARCH_RESULTS: readonly PodcastEpisodeSearchResult[] = [];
const EMPTY_COMPLETION_BY_LANGUAGE: PodcastCompletionByLanguage = {};
const LISTENED_PAGE_SIZE = 12;

interface LanguageGroup {
  code: string;
  badge: string;
  nativeName: string;
  episodes: PodcastEpisode[];
}

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
  const snippet = result.snippet?.trim();

  return (
    <View className="mt-2">
      <View className="self-start rounded-full bg-[rgba(212,197,163,.12)] px-2 py-1">
        <Text className="font-mono text-[9px] uppercase tracking-[0.8px] text-accent">
          {result.matchSource === 'title' ? 'Title' : 'Transcript'}
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
  return (
    <View className="flex-row items-center gap-3 px-5 pt-3">
      <View className="h-11 min-w-0 flex-1 flex-row items-center gap-3 rounded-[18px] border border-line bg-[rgba(255,255,255,.045)] px-3">
        <Search size={18} strokeWidth={2} color="#a1a1aa" />
        <TextInput
          accessibilityLabel="Search podcast episodes"
          autoFocus
          value={query}
          onChangeText={onChangeQuery}
          placeholder="搜尋標題或內容"
          placeholderTextColor="#71717a"
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
          className="h-full min-w-0 flex-1 font-sans text-[14px] text-ink"
        />
        {query.trim() !== '' ? (
          <Tap
            accessibilityRole="button"
            accessibilityLabel="Clear podcast search"
            onPress={onClear}
            className="h-7 w-7 items-center justify-center rounded-full bg-[rgba(255,255,255,.06)]"
          >
            <X size={14} strokeWidth={2} color="#a1a1aa" />
          </Tap>
        ) : null}
      </View>
      <Tap
        accessibilityRole="button"
        accessibilityLabel="Cancel podcast search"
        onPress={onCancel}
        className="h-11 items-center justify-center px-1"
      >
        <Text className="font-sans-medium text-[13px] text-accent">取消</Text>
      </Tap>
    </View>
  );
}

function NowPlayingBar({ player }: { player: PodcastPlayer }) {
  const episode = player.nowPlaying;
  if (episode === null) return null;

  const duration = Math.floor(player.duration);
  const currentTime = Math.min(Math.floor(player.currentTime), duration);

  return (
    <View
      className="absolute inset-x-0 bottom-0 border-t border-line px-5 pb-3 pt-[10px]"
      style={{ backgroundColor: 'rgba(10,10,10,.92)' }}
    >
      <View className="flex-row items-center gap-3">
        <Tap
          onPress={() => player.toggle(episode)}
          accessibilityRole="button"
          accessibilityLabel={player.isPlaying ? 'Pause' : 'Play'}
          className="h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[rgba(212,197,163,.3)] bg-[rgba(212,197,163,.16)]"
        >
          {player.isPlaying ? (
            <Pause size={15} strokeWidth={2} color="#d4c5a3" />
          ) : (
            <Play size={15} strokeWidth={2} color="#d4c5a3" />
          )}
        </Tap>
        <View className="min-w-0 flex-1">
          <Text
            className="font-sans-semibold text-[12.5px] text-ink"
            numberOfLines={1}
          >
            {episode.title}
          </Text>
          <View className="mt-[6px] flex-row items-center gap-2">
            <Text className="w-9 font-mono text-[9px] text-ink-faint">
              {formatPodcastClock(player.currentTime)}
            </Text>
            <Slider
              accessibilityLabel="Seek"
              disabled={duration <= 0}
              minimumValue={0}
              maximumValue={duration > 0 ? duration : 1}
              value={currentTime}
              minimumTrackTintColor="#d4c5a3"
              maximumTrackTintColor="rgba(255,255,255,.12)"
              thumbTintColor="#d4c5a3"
              onSlidingComplete={player.seek}
              style={{ flex: 1, height: 28 }}
            />
            <Text className="w-9 text-right font-mono text-[9px] text-ink-faint">
              {formatPodcastClock(player.duration)}
            </Text>
          </View>
        </View>
      </View>
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
  const { languageCode } = useContentLanguage();
  const { progress, markAllListened } = useEpisodeProgress();

  const [searchQuery, setSearchQuery] = useState('');
  const [searchExpanded, setSearchExpanded] = useState(false);
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 300);
  const [direction, setDirection] = useState<EpisodeSortDirection>('newest');
  const [visibleListened, setVisibleListened] = useState(LISTENED_PAGE_SIZE);
  const [confirmMarkAll, setConfirmMarkAll] = useState(false);

  const feedQuery = usePodcastEpisodesAllLanguages();
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

  // Unheard episodes grouped by language, selected language first.
  const unheardGroups = useMemo<LanguageGroup[]>(() => {
    const orderedOptions = [
      ...CONTENT_LANGUAGE_OPTIONS.filter((o) => o.code === languageCode),
      ...CONTENT_LANGUAGE_OPTIONS.filter((o) => o.code !== languageCode),
    ];
    return orderedOptions
      .map((option) => ({
        code: option.code,
        badge: option.badge,
        nativeName: option.nativeName,
        episodes: sortEpisodes(
          (mergedByLanguage[option.code] ?? []).filter(
            (episode) => !episode.listened,
          ),
          direction,
        ),
      }))
      .filter((group) => group.episodes.length > 0);
  }, [mergedByLanguage, languageCode, direction]);

  const listenedEpisodes = useMemo(
    () =>
      sortEpisodes(
        CONTENT_LANGUAGE_OPTIONS.flatMap(
          (option) => mergedByLanguage[option.code] ?? [],
        ).filter((episode) => episode.listened),
        'newest',
      ),
    [mergedByLanguage],
  );

  const completionByLanguage = useMemo<PodcastCompletionByLanguage>(() => {
    const summaries: Partial<
      Record<ContentLanguageCode, PodcastCompletionSummary>
    > = {};
    for (const option of CONTENT_LANGUAGE_OPTIONS) {
      summaries[option.code] = summarisePodcastCompletion(
        mergedByLanguage[option.code] ?? [],
      );
    }
    return summaries;
  }, [mergedByLanguage]);

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
  const playback = useMemo(() => {
    const pool = mergedByLanguage[languageCode] ?? [];
    if (pool.length === 0) {
      return {
        mode: 'empty' as PlayUnheardMode,
        target: null as PodcastEpisode | null,
        queue: [] as PodcastEpisode[],
      };
    }
    const statusOf = (episode: PodcastEpisode) =>
      resolveEpisodeStatus(episode.listened, episode.lastPositionSeconds);
    const inProgress = sortEpisodes(
      pool.filter((e) => statusOf(e) === 'inProgress'),
      direction,
    );
    const unplayed = sortEpisodes(
      pool.filter((e) => statusOf(e) === 'unplayed'),
      direction,
    );
    const completed = sortEpisodes(
      pool.filter((e) => e.listened),
      direction,
    );

    const unheardOrdered = [...inProgress, ...unplayed];
    if (unheardOrdered.length > 0) {
      return {
        mode: (inProgress.length > 0
          ? 'inProgress'
          : 'unplayed') as PlayUnheardMode,
        target: unheardOrdered[0] ?? null,
        queue: unheardOrdered,
      };
    }
    return {
      mode: 'allCompleted' as PlayUnheardMode,
      target: completed[0] ?? null,
      queue: completed,
    };
  }, [mergedByLanguage, languageCode, direction]);

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

  const hasAnyEpisode = unheardGroups.length > 0 || listenedEpisodes.length > 0;
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
    options?: { showLanguageBadge?: boolean },
  ) =>
    episodes.map((episode, index) => {
      const active =
        player.nowPlaying?.localizationId === episode.localizationId;
      const languageBadge =
        options?.showLanguageBadge === true
          ? { languageBadge: getContentLanguageBadge(episode.languageCode) }
          : {};
      return (
        <EpisodeRow
          key={episode.localizationId}
          episode={episode}
          first={index === 0}
          active={active}
          playing={active && player.isPlaying}
          {...languageBadge}
          onToggle={() => player.playFromQueue(context, episode)}
          onOpen={() => openEpisode(episode)}
        />
      );
    });

  return (
    <View className="flex-1 bg-bg">
      <ScreenScrollView bottomPadding={player.nowPlaying === null ? 24 : 108}>
        <ScreenHeader
          title="Podcast"
          left={
            <PodcastLanguageDropdown
              completionByLanguage={visibleCompletionByLanguage}
            />
          }
          right={
            <Tap
              accessibilityRole="button"
              accessibilityLabel="Search podcast episodes"
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

        {normalisedSearchQuery !== '' && !searchActive ? (
          <EmptyStateCard
            title="搜尋節目內容"
            message="輸入至少兩個字，找出標題或逐字稿中的相關集數。"
          />
        ) : listLoading ? (
          <EpisodeListSkeleton />
        ) : listError ? (
          <EmptyStateCard
            title={searchActive ? 'Search unavailable' : 'Podcast unavailable'}
            message={
              searchActive
                ? 'The podcast search API is unavailable right now.'
                : 'The podcast feed is unavailable right now.'
            }
          />
        ) : searchActive ? (
          searchResults.length > 0 ? (
            <View className="px-5">
              {searchResults.map((result, index) => {
                const episode = result.episode;
                const active =
                  player.nowPlaying?.localizationId === episode.localizationId;
                return (
                  <EpisodeRow
                    key={episode.localizationId}
                    episode={episode}
                    first={index === 0}
                    active={active}
                    playing={active && player.isPlaying}
                    supportingContent={<SearchMatchSummary result={result} />}
                    onToggle={() =>
                      player.playFromQueue(
                        searchResults.map((r) => r.episode),
                        episode,
                      )
                    }
                    onOpen={() => openEpisode(episode)}
                  />
                );
              })}
            </View>
          ) : (
            <EmptyStateCard title="找不到相關集數" message="換個關鍵字試試。" />
          )
        ) : !hasAnyEpisode ? (
          <EmptyStateCard
            title="No episodes yet"
            message="Published episodes will appear here."
          />
        ) : (
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
            />

            {unheardGroups.length > 0 ? (
              <ExpandableSection
                title="未聽"
                count={unheardTotalCount(unheardGroups)}
                defaultExpanded
              >
                {unheardGroups.map((group) => (
                  <View key={group.code} className="pt-1">
                    <View className="flex-row items-center gap-2 pb-1 pt-2">
                      <View className="h-6 w-6 items-center justify-center rounded-md border border-line bg-[rgba(255,255,255,.045)]">
                        <Text className="font-mono text-[10px] text-ink-dim">
                          {group.badge}
                        </Text>
                      </View>
                      <Text className="font-sans-medium text-[12.5px] text-ink-dim">
                        {group.nativeName}
                      </Text>
                      <Text className="font-mono text-[10px] text-ink-faint">
                        ({group.episodes.length})
                      </Text>
                    </View>
                    {renderRows(group.episodes, group.episodes)}
                  </View>
                ))}
              </ExpandableSection>
            ) : null}

            {listenedEpisodes.length > 0 ? (
              <ExpandableSection title="已聽完" count={listenedEpisodes.length}>
                {renderRows(
                  listenedEpisodes.slice(0, visibleListened),
                  listenedEpisodes,
                  { showLanguageBadge: true },
                )}
                {visibleListened < listenedEpisodes.length ? (
                  <Tap
                    accessibilityRole="button"
                    accessibilityLabel="載入更多已聽集數"
                    onPress={() =>
                      setVisibleListened(
                        (current) => current + LISTENED_PAGE_SIZE,
                      )
                    }
                    className="mt-2 items-center rounded-full border border-line py-[10px]"
                  >
                    <Text className="font-mono text-[11px] uppercase tracking-[0.8px] text-ink-dim">
                      載入更多
                    </Text>
                  </Tap>
                ) : null}
              </ExpandableSection>
            ) : null}

            <View className="items-center px-5 pb-2 pt-6">
              <Tap
                accessibilityRole="button"
                accessibilityLabel="全部標記為已聽"
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
                    ? '再按一次確認全部標記已聽'
                    : '全部標記為已聽'}
                </Text>
              </Tap>
            </View>
          </View>
        )}
      </ScreenScrollView>

      <NowPlayingBar player={player} />
    </View>
  );
}

function unheardTotalCount(groups: readonly LanguageGroup[]): number {
  return groups.reduce((sum, group) => sum + group.episodes.length, 0);
}
