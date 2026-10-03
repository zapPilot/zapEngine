import { Check, Download, Info, TriangleAlert } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import type { ReactElement } from 'react';
import { View } from 'react-native';

import { formatDownloadSize } from '@/components/podcast/episodeFormatters';
import { Badge } from '@/components/ui/Badge';
import { Icon } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { useEpisodeDownload } from '@/hooks/useEpisodeDownload';
import type { PodcastEpisode } from '@/integration/podcastFeed';
import type { EpisodeDownloadView } from '@/integration/podcastVideoDownloads';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';

type Translate = ReturnType<typeof useContentLanguage>['t'];

interface StatusLook {
  text: string;
  icon: LucideIcon;
  tone: 'neutral' | 'accent' | 'success' | 'danger';
}

// Only the outcomes are announced; a percentage ticking by would be noise.
const ANNOUNCE = { accessibilityLiveRegion: 'polite' } as const;

function statusLook(
  view: EpisodeDownloadView,
  t: Translate,
): StatusLook | null {
  switch (view.phase) {
    case 'idle':
      return null;
    case 'unsupported':
      return {
        text: t('podcast.downloadUnsupported'),
        icon: Info,
        tone: 'neutral',
      };
    case 'unavailable':
      return {
        text: t('podcast.downloadNoVideo'),
        icon: Info,
        tone: 'neutral',
      };
    case 'downloading':
      return {
        text: t('podcast.downloadStatusDownloading', { percent: view.percent }),
        icon: Download,
        tone: 'accent',
      };
    case 'downloaded':
      return {
        text: t('podcast.downloadStatusSaved', {
          size: formatDownloadSize(view.byteSize ?? 0),
        }),
        icon: Check,
        tone: 'success',
      };
    case 'failed':
      return {
        text: t('podcast.downloadStatusFailed'),
        icon: TriangleAlert,
        tone: 'danger',
      };
  }
}

/**
 * Says in words what `EpisodeDownloadButton` only shows: saved, in progress,
 * failed (with the reason) or impossible. Nothing is rendered while the video
 * is simply waiting to be downloaded.
 */
export function EpisodeDownloadStatus({
  episode,
}: {
  episode: PodcastEpisode;
}): ReactElement | null {
  const { t } = useContentLanguage();
  const { view } = useEpisodeDownload(episode);
  const look = statusLook(view, t);
  if (look === null) return null;
  const announced = view.phase === 'downloaded' || view.phase === 'failed';

  return (
    <View className="mt-4" {...(announced ? ANNOUNCE : {})}>
      <Badge tone={look.tone}>
        <Icon
          icon={look.icon}
          size="xs"
          tone={look.tone === 'neutral' ? 'muted' : look.tone}
        />
        {look.text}
      </Badge>
      {view.message !== null ? (
        <Text variant="caption" tone="danger" className="mt-2">
          {view.message}
        </Text>
      ) : null}
    </View>
  );
}
