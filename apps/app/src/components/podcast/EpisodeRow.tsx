import { Check, Headphones, Pause, Play } from 'lucide-react-native';
import { type ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '@/components/ui/Text';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';

import { formatPodcastEpisodeDate } from '@/components/podcast/episodeFormatters';
import { Tap } from '@/components/ui/Tap';
import type { PodcastEpisode } from '@/integration/podcastFeed';
import { cn } from '@/lib/cn';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';

function EpisodeBadge({ active }: { active: boolean }) {
  return (
    <View
      className={cn(
        'h-10 w-10 shrink-0 items-center justify-center rounded-control border',
        active ? 'border-accent-line bg-accent-soft' : 'border-line bg-surface',
      )}
    >
      <Icon icon={Headphones} size="sm" tone={active ? 'accent' : 'muted'} />
    </View>
  );
}

export function EpisodeRow({
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
  const { languageCode, t } = useContentLanguage();

  return (
    <View
      className={cn(
        'flex-row items-center gap-3 py-[13px]',
        !first && 'border-t border-line',
      )}
    >
      <Tap
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={t('podcast.openEpisode', { title: episode.title })}
        className="min-w-0 flex-1 flex-row items-center gap-3"
      >
        <EpisodeBadge active={active} />
        <View className="min-w-0 flex-1">
          <Text
            variant="subheading"
            tone={active ? 'accent' : 'default'}
            numberOfLines={2}
          >
            {episode.title}
          </Text>
          <View className="mt-1 flex-row flex-wrap items-center gap-2">
            <Text variant="caption" tone="muted">
              {formatPodcastEpisodeDate(
                episode.createdAt,
                'short',
                languageCode,
              )}
            </Text>
            {episode.listened ? (
              <View className="flex-row items-center gap-1">
                <Icon icon={Check} size="xs" tone="success" />
                <Text variant="caption" tone="success">
                  {t('podcast.completedEpisode')}
                </Text>
              </View>
            ) : null}
          </View>
          {supportingContent}
        </View>
      </Tap>
      <IconButton
        icon={playing ? Pause : Play}
        size="sm"
        variant={playing ? 'tonal' : 'secondary'}
        onPress={onToggle}
        accessibilityLabel={
          playing
            ? t('podcast.pauseEpisode', { title: episode.title })
            : t('podcast.playEpisode', { title: episode.title })
        }
      />
    </View>
  );
}
