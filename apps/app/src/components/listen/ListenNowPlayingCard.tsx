import { useState } from 'react';
import { RotateCcw, RotateCw, ChevronDown } from 'lucide-react-native';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { NowPlayingBar } from '@/components/podcast/NowPlayingBar';
import { Tap } from '@/components/ui/Tap';
import { Icon } from '@/components/ui/Icon';
import { ActionSheet } from '@/components/ui/ActionSheet';
import { Text } from '@/components/ui/Text';
import { podcastEpisodeHref } from '@/integration/podcastRoutes';
import { usePodcastPlayer } from '@/providers/PodcastPlayerProvider';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';
const DESTINATIONS = ['video', 'transcript', 'classroom'] as const;
const SPEEDS = [0.75, 1, 1.25, 1.5, 2] as const;
export function ListenNowPlayingCard() {
  const [speedOpen, setSpeedOpen] = useState(false);
  const player = usePodcastPlayer();
  const router = useRouter();
  const { t } = useContentLanguage();
  if (player.nowPlaying === null) return null;
  return (
    <View className="gap-1 border-b border-rule py-3">
      <Text variant="label" tone="muted">
        {t('listen.nowPlaying')}
      </Text>
      <NowPlayingBar
        player={player}
        layout="card"
        controls={
          <>
            {[
              { icon: RotateCcw, seconds: -15, label: t('listen.back15') },
              { icon: RotateCw, seconds: 30, label: t('listen.forward30') },
            ].map(({ icon, seconds, label }) => (
              <Tap
                key={seconds}
                accessibilityRole="button"
                accessibilityLabel={label}
                onPress={() => player.seekRelative(seconds)}
                className="min-h-hit min-w-hit items-center justify-center"
              >
                <Icon icon={icon} size="sm" />
                <Text variant="data" tone="secondary">
                  {Math.abs(seconds)}
                </Text>
              </Tap>
            ))}
            <Tap
              accessibilityRole="button"
              accessibilityLabel={t('podcast.playbackSpeed', {
                speed: player.speed,
              })}
              accessibilityState={{ expanded: speedOpen }}
              onPress={() => setSpeedOpen(true)}
              className="min-h-hit min-w-hit flex-row items-center justify-center gap-1 px-2"
            >
              <Text variant="body-sm">{player.speed}×</Text>
              <Icon icon={ChevronDown} size="xs" />
            </Tap>
          </>
        }
        onOpen={(episode) =>
          router.push(
            podcastEpisodeHref(episode.localizationId, episode.languageCode),
          )
        }
      />
      <View className="flex-row items-center gap-2">
        {DESTINATIONS.map((view) => (
          <View key={view} className="min-w-0 flex-1">
            <Tap
              accessibilityRole="button"
              className="min-h-hit items-center justify-center px-1"
              accessibilityLabel={t(`podcast.${view}`)}
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
              <Text variant="caption" tone="secondary">
                {t(`podcast.${view}`)}
              </Text>
            </Tap>
          </View>
        ))}
      </View>
      <ActionSheet
        visible={speedOpen}
        onClose={() => setSpeedOpen(false)}
        title={t('listen.speed')}
        closeLabel={t('common.close')}
        actions={SPEEDS.map((speed) => ({
          id: String(speed),
          label: t('podcast.playbackSpeed', { speed }),
          onPress: () => player.setSpeed(speed),
        }))}
      />
    </View>
  );
}
