import { Check, Download, RefreshCw, X } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useState, type ReactElement } from 'react';
import { View } from 'react-native';

import { PodcastIconButton } from '@/components/podcast/EpisodeMediaPlayer';
import { RemoveDownloadSheet } from '@/components/podcast/RemoveDownloadSheet';
import { Icon } from '@/components/ui/Icon';
import { ProgressRing } from '@/components/ui/ProgressRing';
import {
  useEpisodeDownload,
  type EpisodeDownloadControlProps,
} from '@/hooks/useEpisodeDownload';
import type { EpisodeDownloadView } from '@/integration/podcastVideoDownloads';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';

type Translate = ReturnType<typeof useContentLanguage>['t'];

interface ButtonLook {
  label: string;
  hint?: string;
  icon: LucideIcon;
  tone: 'default' | 'alert';
}

// The ring is drawn over the button's own 1px border, so it replaces it. It
// only decorates, so presses go straight through to the button.
const RING_OVERLAY = { top: -1, left: -1, pointerEvents: 'none' } as const;

function buttonLook(
  view: Omit<EpisodeDownloadView, 'phase'> & {
    phase: Exclude<EpisodeDownloadView['phase'], 'unsupported'>;
  },
  t: Translate,
): ButtonLook {
  switch (view.phase) {
    case 'unavailable':
      return {
        label: t('podcast.downloadNoVideo'),
        icon: Download,
        tone: 'default',
      };
    case 'idle':
      return {
        label: t('podcast.downloadVideo'),
        hint: t('podcast.downloadHint'),
        icon: Download,
        tone: 'default',
      };
    case 'downloading':
      return {
        label: t('podcast.downloadCancel', { percent: view.percent }),
        icon: X,
        tone: 'default',
      };
    case 'downloaded':
      return {
        label: t('podcast.downloadRemove'),
        icon: Check,
        tone: 'default',
      };
    case 'failed':
      return {
        label: t('podcast.downloadRetry'),
        icon: RefreshCw,
        tone: 'alert',
      };
  }
}

/**
 * Header action for one episode's offline video. Its look carries the state
 * (download / progress ring / saved / retry); `EpisodeDownloadStatus` spells
 * the same state out in words, so this stays a plain 44px circle that lines up
 * with its siblings.
 */
export function EpisodeDownloadButton({
  episode,
}: EpisodeDownloadControlProps): ReactElement | null {
  const { t } = useContentLanguage();
  const { downloads, view } = useEpisodeDownload(episode);
  // The sheet keeps the episode it was opened for: the screen can move on to
  // another episode while it is up, and the confirm must still hit this one.
  const [removal, setRemoval] = useState({ open: false, id: '', size: 0 });
  const id = episode.localizationId;
  if (view.phase === 'unsupported') return null;
  const downloading = view.phase === 'downloading';
  const disabled = !downloads.isHydrated || view.phase === 'unavailable';
  const { label, hint, icon, tone } = buttonLook(
    { ...view, phase: view.phase },
    t,
  );

  const press = () => {
    if (downloading) downloads.cancel(id);
    else if (view.phase === 'downloaded')
      setRemoval({ open: true, id, size: view.byteSize ?? 0 });
    else void downloads.download(episode);
  };

  return (
    <>
      <PodcastIconButton
        label={label}
        hint={hint}
        tone={tone}
        busy={downloading}
        disabled={disabled}
        onPress={press}
      >
        {downloading ? (
          <View className="absolute" style={RING_OVERLAY}>
            <ProgressRing value={view.percent} size={44} strokeWidth={2.5}>
              <Icon icon={icon} size="xs" tone={tone} />
            </ProgressRing>
          </View>
        ) : (
          <Icon icon={icon} size="md" tone={tone} />
        )}
      </PodcastIconButton>
      <RemoveDownloadSheet
        visible={removal.open}
        byteSize={removal.size}
        onClose={() => setRemoval((current) => ({ ...current, open: false }))}
        onConfirm={() => {
          setRemoval((current) => ({ ...current, open: false }));
          void downloads.remove(removal.id);
        }}
      />
    </>
  );
}
