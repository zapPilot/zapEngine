import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { NowPlayingBar } from '@/components/podcast/NowPlayingBar';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { podcastEpisodeHref } from '@/integration/podcastRoutes';
import { usePodcastPlayer } from '@/providers/PodcastPlayerProvider';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';
const DESTINATIONS = ['video', 'transcript', 'classroom'] as const;
const SPEEDS = [0.75, 1, 1.25, 1.5, 2] as const;
export function ListenNowPlayingCard() {
  const player = usePodcastPlayer();
  const router = useRouter();
  const { t } = useContentLanguage();
  if (player.nowPlaying === null) return null;
  return (
    <View className="gap-3 py-4">
      <Text variant="label" tone="muted">
        {t('listen.nowPlaying')}
      </Text>
      <NowPlayingBar
        player={player}
        layout="card"
        onOpen={(episode) =>
          router.push(
            podcastEpisodeHref(episode.localizationId, episode.languageCode),
          )
        }
      />
      <View className="flex-row items-center gap-2">
        <View className="min-w-0 flex-1">
          <Button
            variant="secondary"
            size="sm"
            onPress={() => player.seekRelative(-15)}
          >
            {t('listen.back15')}
          </Button>
        </View>
        <View className="min-w-0 flex-1">
          <Button
            variant="secondary"
            size="sm"
            onPress={() => player.seekRelative(30)}
          >
            {t('listen.forward30')}
          </Button>
        </View>
      </View>
      <View className="flex-row items-center gap-2">
        {DESTINATIONS.map((view) => (
          <View key={view} className="min-w-0 flex-1">
            <Button
              variant="ghost"
              size="sm"
              onPress={() => {
                const episode = player.nowPlaying;
                if (episode !== null)
                  router.push(
                    podcastEpisodeHref(
                      episode.localizationId,
                      episode.languageCode,
                      view,
                    ),
                  );
              }}
            >
              {t(`podcast.${view}`)}
            </Button>
          </View>
        ))}
      </View>
      <SegmentedControl
        accessibilityLabel={t('listen.speed')}
        options={SPEEDS.map((speed) => ({
          value: String(speed),
          label: `${speed}×`,
          accessibilityLabel: t('podcast.playbackSpeed', { speed }),
        }))}
        value={String(player.speed)}
        onChange={(value) => player.setSpeed(Number(value))}
      />
    </View>
  );
}
