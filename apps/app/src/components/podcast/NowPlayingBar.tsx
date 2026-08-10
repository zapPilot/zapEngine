import Slider from '@react-native-community/slider';
import { Pause, Play } from 'lucide-react-native';
import { Text, View } from 'react-native';

import { formatPodcastClock } from '@/components/podcast/episodeFormatters';
import { Tap } from '@/components/ui/Tap';
import type { PodcastEpisode } from '@/integration/podcastFeed';
import type { PodcastPlayer } from '@/integration/podcastPlayerTypes';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';

export function NowPlayingBar({
  player,
  onOpen,
}: {
  player: PodcastPlayer;
  onOpen: (episode: PodcastEpisode) => void;
}) {
  const { t } = useContentLanguage();
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
          accessibilityLabel={
            player.isPlaying ? t('common.pause') : t('common.play')
          }
          className="h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[rgba(212,197,163,.3)] bg-[rgba(212,197,163,.16)]"
        >
          {player.isPlaying ? (
            <Pause size={15} strokeWidth={2} color="#d4c5a3" />
          ) : (
            <Play size={15} strokeWidth={2} color="#d4c5a3" />
          )}
        </Tap>
        <View className="min-w-0 flex-1">
          <Tap
            accessibilityRole="button"
            accessibilityLabel={t('podcast.openEpisode', {
              title: episode.title,
            })}
            onPress={() => onOpen(episode)}
            className="flex-row items-center gap-2"
          >
            <Text
              className="min-w-0 flex-1 font-sans-semibold text-[12.5px] text-ink"
              numberOfLines={1}
            >
              {episode.title}
            </Text>
            {player.currentSection === 'classroom' ? (
              <View className="shrink-0 rounded-full bg-[rgba(212,197,163,.16)] px-2 py-[2px]">
                <Text className="font-sans-semibold text-[9px] text-accent">
                  {t('podcast.classroom')}
                </Text>
              </View>
            ) : null}
          </Tap>
          <View className="mt-[6px] flex-row items-center gap-2">
            <Text className="w-9 font-mono text-[9px] text-ink-faint">
              {formatPodcastClock(player.currentTime)}
            </Text>
            <Slider
              accessibilityLabel={t('common.seek')}
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
