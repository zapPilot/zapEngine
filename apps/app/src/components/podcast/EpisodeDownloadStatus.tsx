import { Check, Download, Info, TriangleAlert } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import type { ReactElement } from 'react';
import { View } from 'react-native';

import { formatDownloadSize } from '@/components/podcast/episodeFormatters';
import { Badge } from '@/components/ui/Badge';
import { Icon } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import {
  useEpisodeDownload,
  type EpisodeDownloadControlProps,
} from '@/hooks/useEpisodeDownload';
import type { EpisodeDownloadView } from '@/integration/podcastVideoDownloads';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';

type Translate = ReturnType<typeof useContentLanguage>['t'];

interface StatusLook {
  text: string;
  icon: LucideIcon;
  tone: 'default' | 'alert';
}

// Only the outcomes are announced; a percentage ticking by would be noise.
const ANNOUNCE = { accessibilityLiveRegion: 'polite' } as const;

function statusLook(
  view: Omit<EpisodeDownloadView, 'phase'> & {
    phase: Exclude<EpisodeDownloadView['phase'], 'unsupported'>;
  },
  t: Translate,
): StatusLook | null {
  switch (view.phase) {
    case 'idle':
      return null;
    case 'unavailable':
      return {
        text: t('podcast.downloadNoVideo'),
        icon: Info,
        tone: 'default',
      };
    case 'downloading':
      return {
        text: t('podcast.downloadStatusDownloading', { percent: view.percent }),
        icon: Download,
        tone: 'default',
      };
    case 'downloaded':
      return {
        text: t('podcast.downloadStatusSaved', {
          size: formatDownloadSize(view.byteSize ?? 0),
        }),
        icon: Check,
        tone: 'default',
      };
    case 'failed':
      return {
        text: t('podcast.downloadStatusFailed'),
        icon: TriangleAlert,
        tone: 'alert',
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
}: EpisodeDownloadControlProps): ReactElement | null {
  const { t } = useContentLanguage();
  const { view } = useEpisodeDownload(episode);
  if (view.phase === 'unsupported') return null;
  const look = statusLook({ ...view, phase: view.phase }, t);
  if (look === null) return null;
  const announced = view.phase === 'downloaded' || view.phase === 'failed';

  return (
    <View className="mt-4" {...(announced ? ANNOUNCE : {})}>
      <Badge tone={look.tone}>
        <Icon
          icon={look.icon}
          size="xs"
          tone={look.tone === 'default' ? 'muted' : look.tone}
        />
        {look.text}
      </Badge>
      {view.message !== null ? (
        <Text variant="caption" tone="alert" className="mt-2">
          {view.message}
        </Text>
      ) : null}
    </View>
  );
}
