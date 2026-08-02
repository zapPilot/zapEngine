import { Headphones, Pause, Play } from 'lucide-react-native';
import { type ReactNode } from 'react';
import { Text, View } from 'react-native';

import { formatPodcastEpisodeDate } from '@/components/podcast/episodeFormatters';
import { Tap } from '@/components/ui/Tap';
import type { PodcastEpisode } from '@/integration/podcastFeed';
import { cn } from '@/lib/cn';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';

export function EpisodeBadge({ active }: { active: boolean }) {
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
        'flex-row items-start gap-3 py-[13px]',
        !first && 'border-t border-line',
      )}
    >
      <Tap
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={t('podcast.openEpisode', { title: episode.title })}
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
              {formatPodcastEpisodeDate(
                episode.createdAt,
                'short',
                languageCode,
              )}
            </Text>
            {episode.listened ? (
              <Text className="font-mono text-[9px] uppercase tracking-[0.9px] text-ink-faint">
                {t('podcast.completedEpisode')}
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
          playing
            ? t('podcast.pauseEpisode', { title: episode.title })
            : t('podcast.playEpisode', { title: episode.title })
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
