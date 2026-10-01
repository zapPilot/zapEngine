import { tokens } from '@zapengine/design-tokens/tokens';
import Slider from '@react-native-community/slider';
import { Pause, Play } from 'lucide-react-native';
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
import { cn } from '@/lib/cn';
export function NowPlayingBar({
  player,
  onOpen,
  layout = 'bar',
}: {
  player: PodcastPlayer;
  onOpen: (episode: PodcastEpisode) => void;
  layout?: 'bar' | 'card';
}) {
  const { t } = useContentLanguage();
  const episode = player.nowPlaying;
  if (episode === null) return null;
  const duration = Math.floor(player.duration);
  const currentTime = Math.min(Math.floor(player.currentTime), duration);
  return (
    <View
      className={cn(
        'border border-line bg-surface p-3',
        layout === 'card' ? 'rounded-card' : 'border-x-0',
      )}
    >
      <View className="flex-row items-center gap-2">
        <IconButton
          icon={player.isPlaying ? Pause : Play}
          tone="accent"
          onPress={() => player.toggle(episode)}
          accessibilityLabel={
            player.isPlaying ? t('common.pause') : t('common.play')
          }
        />
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
            <Text variant="label" numberOfLines={layout === 'card' ? 2 : 1}>
              {episode.title}
            </Text>
          </Tap>
          {player.currentSection === 'classroom' ? (
            <Badge tone="accent">
              {player.currentSectionLanguage === null
                ? t('podcast.classroom')
                : `${t('podcast.classroom')} · ${classroomLanguageLabel(player.currentSectionLanguage, t)}`}
            </Badge>
          ) : null}
        </View>
      </View>
      <View className="mt-1 flex-row items-center gap-2">
        <Text variant="numeric-sm" tone="muted">
          {formatPodcastClock(player.currentTime)}
        </Text>
        <Slider
          accessibilityLabel={t('common.seek')}
          disabled={duration <= 0}
          minimumValue={0}
          maximumValue={duration > 0 ? duration : 1}
          value={currentTime}
          minimumTrackTintColor={tokens.color.accent}
          maximumTrackTintColor={tokens.color.line}
          thumbTintColor={tokens.color.accent}
          onSlidingComplete={player.seek}
          style={{ flex: 1, height: tokens.size.hit }}
        />
        <Text variant="numeric-sm" tone="muted">
          {formatPodcastClock(player.duration)}
        </Text>
      </View>
    </View>
  );
}
