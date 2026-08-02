import { Pause, Play } from 'lucide-react-native';
import { Text, View } from 'react-native';

import { formatPodcastClock } from '@/components/podcast/episodeFormatters';
import type { EpisodeSortDirection } from '@/components/podcast/episodeSorting';
import { Card } from '@/components/ui/Card';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { RangeTabs } from '@/components/ui/RangeTabs';
import { Tap } from '@/components/ui/Tap';
import type { PodcastEpisode } from '@/integration/podcastFeed';
import type { TranslationKey } from '@/i18n/translations';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';

export type PlayUnheardMode =
  | 'unplayed'
  | 'inProgress'
  | 'allCompleted'
  | 'empty';

interface CardCopy {
  eyebrow: string;
  title: string;
  subtitle: string;
  buttonLabel: string;
}

type Translate = (
  key: TranslationKey,
  params?: Readonly<Record<string, string | number>>,
) => string;

function resolveCopy(
  mode: PlayUnheardMode,
  target: PodcastEpisode | null,
  direction: EpisodeSortDirection,
  isPlaying: boolean,
  t: Translate,
): CardCopy {
  const edge = t(direction === 'newest' ? 'podcast.newest' : 'podcast.oldest');

  if (mode === 'allCompleted') {
    return {
      eyebrow: t('podcast.allCompletedEyebrow'),
      title: t('podcast.allCompletedTitle'),
      subtitle: t('podcast.restartFrom', { edge }),
      buttonLabel: isPlaying
        ? t('common.pause')
        : t('podcast.restartButton', { edge }),
    };
  }
  if (mode === 'inProgress' && target !== null) {
    return {
      eyebrow: t('podcast.continueListening'),
      title: target.title,
      subtitle: t('podcast.lastPosition', {
        time: formatPodcastClock(target.lastPositionSeconds),
      }),
      buttonLabel: isPlaying
        ? t('common.pause')
        : t('podcast.continueListening'),
    };
  }
  return {
    eyebrow: t('podcast.oneTapPlay'),
    title: target?.title ?? '',
    subtitle: t('podcast.startUnheardFrom', { edge }),
    buttonLabel: isPlaying ? t('common.pause') : t('podcast.playUnheard'),
  };
}

export function PlayUnheardCard({
  mode,
  target,
  direction,
  isPlaying,
  onDirectionChange,
  onPlay,
  onOpen,
}: {
  mode: PlayUnheardMode;
  target: PodcastEpisode | null;
  direction: EpisodeSortDirection;
  isPlaying: boolean;
  onDirectionChange: (direction: EpisodeSortDirection) => void;
  onPlay: () => void;
  onOpen: () => void;
}) {
  const { t } = useContentLanguage();
  if (mode === 'empty') return null;

  const newestLabel = t('podcast.newest');
  const oldestLabel = t('podcast.oldest');
  const directionOptions = [newestLabel, oldestLabel] as const;
  const copy = resolveCopy(mode, target, direction, isPlaying, t);

  const body = (
    <>
      <Text
        className="mt-2 font-sans-bold text-[19px] leading-[26px] text-ink"
        numberOfLines={2}
      >
        {copy.title}
      </Text>
      <Text className="mt-1 text-[12.5px] leading-[19px] text-ink-dim">
        {copy.subtitle}
      </Text>
    </>
  );

  return (
    <View className="px-5 pt-3">
      <Card className="p-4">
        <View className="flex-row items-center justify-between gap-3">
          <Text className="font-mono text-[10px] uppercase tracking-[1.1px] text-accent">
            {copy.eyebrow}
          </Text>
          <RangeTabs
            options={directionOptions}
            value={direction === 'newest' ? newestLabel : oldestLabel}
            onChange={(value) =>
              onDirectionChange(value === oldestLabel ? 'oldest' : 'newest')
            }
          />
        </View>
        {target !== null ? (
          <Tap
            accessibilityRole="button"
            accessibilityLabel={t('podcast.openEpisode', {
              title: target.title,
            })}
            onPress={onOpen}
          >
            {body}
          </Tap>
        ) : (
          body
        )}

        <View className="mt-3">
          <PrimaryButton accessibilityLabel={copy.buttonLabel} onPress={onPlay}>
            {isPlaying ? (
              <Pause size={16} strokeWidth={2.2} color="#0a0a0a" />
            ) : (
              <Play size={16} strokeWidth={2.2} color="#0a0a0a" />
            )}
            {copy.buttonLabel}
          </PrimaryButton>
        </View>
      </Card>
    </View>
  );
}
