import Slider from '@react-native-community/slider';
import { Headphones, Pause, Play } from 'lucide-react-native';
import { Text, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { ScreenScrollView } from '@/components/ui/ScreenScrollView';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import { Tap } from '@/components/ui/Tap';
import {
  type PodcastEpisode,
  usePodcastEpisodes,
} from '@/integration/podcastFeed';
import { usePodcastPlayer } from '@/integration/podcastPlayer';
import type { PodcastPlayer } from '@/integration/podcastPlayerTypes';
import { cn } from '@/lib/cn';

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
});

function formatEpisodeDate(createdAt: string): string {
  const parsed = new Date(createdAt);
  return Number.isNaN(parsed.getTime()) ? '' : dateFormatter.format(parsed);
}

function formatClock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
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
  onToggle,
}: {
  episode: PodcastEpisode;
  first: boolean;
  active: boolean;
  playing: boolean;
  onToggle: () => void;
}) {
  return (
    <View
      className={cn(
        'flex-row gap-3 py-[13px]',
        !first && 'border-t border-line',
      )}
    >
      <EpisodeBadge active={active} />
      <View className="min-w-0 flex-1">
        <View className="flex-row items-center justify-between gap-2">
          <Text
            className={cn(
              'min-w-0 flex-1 font-sans-semibold text-[14px]',
              active ? 'text-accent' : 'text-ink',
            )}
            numberOfLines={1}
          >
            {episode.title}
          </Text>
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
        <View className="mt-[5px] flex-row items-center gap-2">
          <Text className="font-mono text-[10px] text-ink-faint">
            {formatEpisodeDate(episode.createdAt)}
          </Text>
          {episode.listened ? (
            <Text className="font-mono text-[9px] uppercase tracking-[0.9px] text-ink-faint">
              Listened
            </Text>
          ) : null}
        </View>
      </View>
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
              {formatClock(player.currentTime)}
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
              {formatClock(player.duration)}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

export function PodcastScreen() {
  const { data, isLoading, isError } = usePodcastEpisodes();
  const player = usePodcastPlayer();
  const episodes = data ?? [];

  return (
    <View className="flex-1 bg-bg">
      <ScreenScrollView bottomPadding={player.nowPlaying === null ? 24 : 108}>
        <ScreenHeader title="Podcast" />

        <View className="px-5 pt-[18px]">
          <Text className="font-mono text-[9.5px] uppercase tracking-[1.14px] text-ink-faint">
            From Fed to Chain · Daily Episodes
          </Text>
        </View>

        {isLoading ? (
          <EpisodeListSkeleton />
        ) : (
          <View className="px-5">
            {episodes.map((episode, index) => (
              <EpisodeRow
                key={episode.localizationId}
                episode={episode}
                first={index === 0}
                active={player.nowPlaying?.id === episode.id}
                playing={
                  player.nowPlaying?.id === episode.id && player.isPlaying
                }
                onToggle={() => player.toggle(episode)}
              />
            ))}
          </View>
        )}

        {!isLoading && episodes.length === 0 ? (
          <View className="px-5 pt-[18px]">
            <Card className="p-5">
              <Text className="font-sans-semibold text-[15px] text-ink">
                {isError ? 'Podcast unavailable' : 'No episodes yet'}
              </Text>
              <Text className="mt-2 text-[12.5px] leading-[19px] text-ink-dim">
                {isError
                  ? 'The podcast feed is unavailable right now.'
                  : 'Published episodes will appear here.'}
              </Text>
            </Card>
          </View>
        ) : null}
      </ScreenScrollView>

      <NowPlayingBar player={player} />
    </View>
  );
}
