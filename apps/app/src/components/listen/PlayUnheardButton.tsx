import { Icon } from '@/components/ui/Icon';
import { useState } from 'react';
import { ChevronDown, Pause, Play } from 'lucide-react-native';
import { View } from 'react-native';
import { Text } from '@/components/ui/Text';

import { formatPodcastClock } from '@/components/podcast/episodeFormatters';
import type { EpisodeSortDirection } from '@/components/podcast/episodeSorting';
import { ActionSheet } from '@/components/ui/ActionSheet';
import { IconButton } from '@/components/ui/IconButton';
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

export function PlayUnheardButton({
  mode,
  target,
  activeEpisode = null,
  direction,
  isPlaying,
  onDirectionChange,
  onPlay,
  onOpen,
}: {
  activeEpisode?: PodcastEpisode | null;
  mode: PlayUnheardMode;
  target: PodcastEpisode | null;
  direction: EpisodeSortDirection;
  isPlaying: boolean;
  onDirectionChange: (direction: EpisodeSortDirection) => void;
  onPlay: () => void;
  onOpen: () => void;
}) {
  const { t } = useContentLanguage();
  const [orderOpen, setOrderOpen] = useState(false);
  if (mode === 'empty') return null;

  const newestLabel = t('podcast.newest');
  const oldestLabel = t('podcast.oldest');
  const sameTarget =
    target !== null &&
    activeEpisode?.localizationId === target.localizationId &&
    activeEpisode.languageCode === target.languageCode;
  const copy = resolveCopy(mode, target, direction, isPlaying, t);

  return (
    <View className="border-b border-rule py-1">
      <View className="flex-row items-center justify-between gap-2">
        <Text variant="caption" tone="muted">
          {sameTarget ? t('common.episodeOrder') : copy.eyebrow}
        </Text>
        <Tap
          accessibilityRole="button"
          accessibilityLabel={t('common.episodeOrder')}
          accessibilityState={{ expanded: orderOpen }}
          onPress={() => setOrderOpen(true)}
          className="min-h-hit flex-row items-center gap-1 px-2"
        >
          <Text variant="caption">
            {direction === 'newest' ? newestLabel : oldestLabel}
          </Text>
          <Icon icon={ChevronDown} size="xs" />
        </Tap>
      </View>
      {!sameTarget ? (
        <View className="flex-row items-center gap-2 pb-2">
          <IconButton
            icon={isPlaying ? Pause : Play}
            accessibilityLabel={copy.buttonLabel}
            onPress={onPlay}
          />
          <Tap
            accessibilityRole="button"
            accessibilityLabel={
              target === null
                ? copy.title
                : t('podcast.openEpisode', { title: target.title })
            }
            onPress={onOpen}
            className="min-h-hit min-w-0 flex-1 justify-center"
          >
            <Text variant="body" numberOfLines={2}>
              {copy.title}
            </Text>
            <Text variant="caption" tone="muted">
              {copy.subtitle}
            </Text>
          </Tap>
        </View>
      ) : null}
      <ActionSheet
        visible={orderOpen}
        onClose={() => setOrderOpen(false)}
        title={t('common.episodeOrder')}
        closeLabel={t('common.close')}
        actions={[
          {
            id: 'newest',
            label: newestLabel,
            onPress: () => onDirectionChange('newest'),
          },
          {
            id: 'oldest',
            label: oldestLabel,
            onPress: () => onDirectionChange('oldest'),
          },
        ]}
      />
    </View>
  );
}
