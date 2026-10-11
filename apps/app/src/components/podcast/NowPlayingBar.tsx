import { tokens } from '@zapengine/design-tokens/tokens';
import Slider from '@react-native-community/slider';
import { Pause, Play } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import {
  classroomLanguageLabel,
  formatPodcastClock,
} from './episodeFormatters';
import { Text } from '@/components/ui/Text';
import { Badge } from '@/components/ui/Badge';
import { IconButton } from '@/components/ui/IconButton';
import { Tap } from '@/components/ui/Tap';
import type { PodcastEpisode } from '@/integration/podcastFeed';
import type { PodcastPlayer } from '@/integration/podcastPlayerTypes';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';
export function NowPlayingBar({
  player,
  onOpen,
  layout = 'bar',
  controls,
}: {
  player: PodcastPlayer;
  onOpen: (episode: PodcastEpisode) => void;
  layout?: 'bar' | 'card';
  controls?: ReactNode;
}) {
  const { t } = useContentLanguage();
  const episode = player.nowPlaying;
  if (episode === null) return null;
  const duration = Number.isFinite(player.duration)
    ? Math.max(0, player.duration)
    : 0;
  const currentTime = Number.isFinite(player.currentTime)
    ? Math.max(0, player.currentTime)
    : 0;
  return (
    <View
      className={
        layout === 'card'
          ? 'bg-transparent'
          : 'border border-x-0 border-rule bg-sheet p-3'
      }
    >
      <View className="flex-row items-center gap-2">
        {layout === 'bar' ? (
          <IconButton
            icon={player.isPlaying ? Pause : Play}
            tone="default"
            onPress={() => player.toggle(episode)}
            accessibilityLabel={
              player.isPlaying ? t('common.pause') : t('common.play')
            }
          />
        ) : null}
        <View className="min-w-0 flex-1">
          <Tap
            accessibilityRole="button"
            accessibilityLabel={t('podcast.openEpisode', {
              title: episode.title,
            })}
            onPress={() => onOpen(episode)}
            feedback="highlight"
            className="min-h-hit justify-center"
          >
            <Text
              variant={layout === 'card' ? 'body-lg' : 'label'}
              numberOfLines={layout === 'card' ? 3 : 1}
            >
              {episode.title}
            </Text>
          </Tap>
          {player.currentSection === 'classroom' ? (
            <Badge tone="default">
              {player.currentSectionLanguage === null
                ? t('podcast.classroom')
                : `${t('podcast.classroom')} · ${classroomLanguageLabel(player.currentSectionLanguage, t)}`}
            </Badge>
          ) : null}
        </View>
      </View>
      <View className="mt-1 flex-row items-center gap-2">
        <Text variant="data" tone="muted">
          {formatPodcastClock(currentTime)}
        </Text>
        <Slider
          accessibilityLabel={t('common.seek')}
          disabled={duration <= 0}
          minimumValue={0}
          maximumValue={duration > 0 ? duration : 1}
          value={duration > 0 ? Math.min(currentTime, duration) : 0}
          minimumTrackTintColor={tokens.mode.night['ink']}
          maximumTrackTintColor={tokens.mode.night['rule']}
          thumbTintColor={tokens.mode.night['ink']}
          onSlidingComplete={player.seek}
          style={{ flex: 1, height: tokens.size.hit }}
        />
        <Text variant="data" tone="muted">
          {duration > 0 ? formatPodcastClock(duration) : '—'}
        </Text>
      </View>
      {layout === 'card' ? (
        <View className="flex-row flex-wrap items-center justify-between gap-2">
          <IconButton
            icon={player.isPlaying ? Pause : Play}
            tone="default"
            onPress={() => player.toggle(episode)}
            accessibilityLabel={
              player.isPlaying ? t('common.pause') : t('common.play')
            }
          />
          {controls}
        </View>
      ) : null}
    </View>
  );
}
