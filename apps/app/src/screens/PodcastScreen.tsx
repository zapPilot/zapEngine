import Slider from '@react-native-community/slider';
import { useRouter } from 'expo-router';
import { Headphones, Pause, Play, Search, X } from 'lucide-react-native';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { PodcastLanguageDropdown } from '@/components/content/ContentLanguageSelector';
import {
  formatPodcastClock,
  formatPodcastEpisodeDate,
} from '@/components/podcast/episodeFormatters';
import { Card } from '@/components/ui/Card';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { ScreenScrollView } from '@/components/ui/ScreenScrollView';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import { Tap } from '@/components/ui/Tap';
import {
  isPodcastSearchQueryValid,
  normalisePodcastSearchQuery,
  usePodcastEpisodeSearch,
  usePodcastEpisodes,
} from '@/integration/podcastFeed';
import type {
  PodcastEpisode,
  PodcastEpisodeSearchResult,
} from '@/integration/podcastFeed';
import type { PodcastPlayer } from '@/integration/podcastPlayerTypes';
import { cn } from '@/lib/cn';
import { usePodcastPlayer } from '@/providers/PodcastPlayerProvider';

const EMPTY_SEARCH_RESULTS: readonly PodcastEpisodeSearchResult[] = [];
const EMPTY_EPISODES: readonly PodcastEpisode[] = [];

function useDebouncedValue(value: string, delayMs: number): string {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs, value]);

  return debouncedValue;
}

function EpisodeBadge({ active }: { active: boolean }) {
  return (
    <View
      className={cn(
        'h-10 w-10 shrink-0 items-center justify-center rounded-xl border',
        active
          ? 'border-[rgba(212,197,163,.3)] bg-[rgba(212,197,163,.12)]'
          : 'border-line bg-[rgba(255,255,255,.045)]',
      )}
    >
      <Headphones
        size={18}
        strokeWidth={1.8}
        color={active ? '#d4c5a3' : '#a1a1aa'}
      />
    </View>
  );
}

function EpisodeRow({
  episode,
  first,
  active,
  playing,
  supportingContent,
  onToggle,
  onOpen,
}: {
  episode: PodcastEpisode;
  first: boolean;
  active: boolean;
  playing: boolean;
  supportingContent?: ReactNode;
  onToggle: () => void;
  onOpen: () => void;
}) {
  return (
    <View
      className={cn(
        'flex-row items-start gap-3 py-[13px]',
        !first && 'border-t border-line',
      )}
    >
      <Tap
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`Open ${episode.title}`}
        className="min-w-0 flex-1 flex-row gap-3"
      >
        <EpisodeBadge active={active} />
        <View className="min-w-0 flex-1">
          <Text
            className={cn(
              'font-sans-semibold text-[14px]',
              active ? 'text-accent' : 'text-ink',
            )}
            numberOfLines={1}
          >
            {episode.title}
          </Text>
          <View className="mt-[5px] flex-row items-center gap-2">
            <Text className="font-mono text-[10px] text-ink-faint">
              {formatPodcastEpisodeDate(episode.createdAt)}
            </Text>
            {episode.listened ? (
              <Text className="font-mono text-[9px] uppercase tracking-[0.9px] text-ink-faint">
                Listened
              </Text>
            ) : null}
          </View>
          {supportingContent}
        </View>
      </Tap>
      <Tap
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={
          playing ? `Pause ${episode.title}` : `Play ${episode.title}`
        }
        className={cn(
          'h-8 w-8 shrink-0 items-center justify-center rounded-full border',
          active
            ? 'border-[rgba(212,197,163,.3)] bg-[rgba(212,197,163,.16)]'
            : 'border-line bg-[rgba(255,255,255,.05)]',
        )}
      >
        {playing ? (
          <Pause size={14} strokeWidth={2} color="#d4c5a3" />
        ) : (
          <Play size={14} strokeWidth={2} color="#cfcabb" />
        )}
      </Tap>
    </View>
  );
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
}: {
  query: string;
  onChangeQuery: (query: string) => void;
  onClear: () => void;
}) {
  return (
    <View className="px-5 pt-4">
      <View className="flex-row items-center gap-3 rounded-[22px] border border-line bg-[rgba(255,255,255,.045)] px-4 py-3">
        <Search size={18} strokeWidth={2} color="#a1a1aa" />
        <TextInput
          accessibilityLabel="Search podcast episodes"
          value={query}
          onChangeText={onChangeQuery}
          placeholder="搜尋標題或內容"
          placeholderTextColor="#71717a"
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
          className="min-w-0 flex-1 font-sans text-[14px] text-ink"
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
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 300);
  const feedQuery = usePodcastEpisodes();
  const searchQueryResult = usePodcastEpisodeSearch(debouncedSearchQuery);
  const player = usePodcastPlayer();
  const normalisedSearchQuery = normalisePodcastSearchQuery(searchQuery);
  const searchActive = isPodcastSearchQueryValid(normalisedSearchQuery);
  const searchPending =
    searchActive && debouncedSearchQuery.trim() !== normalisedSearchQuery;
  const searchResults = searchQueryResult.data ?? EMPTY_SEARCH_RESULTS;
  const episodes = useMemo(
    () =>
      searchActive
        ? searchResults.map((result) => result.episode)
        : (feedQuery.data ?? EMPTY_EPISODES),
    [feedQuery.data, searchActive, searchResults],
  );
  const listLoading = searchActive
    ? (searchQueryResult.isLoading || searchPending) &&
      searchResults.length === 0
    : feedQuery.isLoading;
  const listError = searchActive
    ? searchQueryResult.isError
    : feedQuery.isError;

  return (
    <View className="flex-1 bg-bg">
      <ScreenScrollView bottomPadding={player.nowPlaying === null ? 24 : 108}>
        <ScreenHeader title="Podcast" left={<PodcastLanguageDropdown />} />

        <View className="px-5 pt-[18px]">
          <Text className="font-mono text-[9.5px] uppercase tracking-[1.14px] text-ink-faint">
            Daily Episodes
          </Text>
        </View>

        <PodcastSearchBar
          query={searchQuery}
          onChangeQuery={setSearchQuery}
          onClear={() => setSearchQuery('')}
        />

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
        ) : episodes.length > 0 ? (
          <View className="px-5">
            {episodes.map((episode, index) => {
              const searchResult = searchActive
                ? searchResults.find(
                    (result) => result.episode.id === episode.id,
                  )
                : undefined;
              return (
                <EpisodeRow
                  key={episode.localizationId}
                  episode={episode}
                  first={index === 0}
                  active={player.nowPlaying?.id === episode.id}
                  playing={
                    player.nowPlaying?.id === episode.id && player.isPlaying
                  }
                  supportingContent={
                    searchResult !== undefined ? (
                      <SearchMatchSummary result={searchResult} />
                    ) : undefined
                  }
                  onToggle={() => player.playFromQueue(episodes, episode)}
                  onOpen={() =>
                    router.push(
                      `/podcast/${encodeURIComponent(episode.localizationId)}`,
                    )
                  }
                />
              );
            })}
          </View>
        ) : (
          <EmptyStateCard
            title={searchActive ? '找不到相關集數' : 'No episodes yet'}
            message={
              searchActive
                ? '換個關鍵字試試。'
                : 'Published episodes will appear here.'
            }
          />
        )}
      </ScreenScrollView>

      <NowPlayingBar player={player} />
    </View>
  );
}
