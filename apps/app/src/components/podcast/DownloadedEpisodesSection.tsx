import { Check, Download, Info, Trash2, X } from 'lucide-react-native';
import { useMemo, useState, type ReactElement } from 'react';
import { Image, View } from 'react-native';

import {
  formatDownloadSize,
  formatPodcastClock,
  formatPodcastEpisodeDate,
} from '@/components/podcast/episodeFormatters';
import type { EpisodeSortDirection } from '@/components/podcast/episodeSorting';
import { ExpandableSection } from '@/components/podcast/ExpandableSection';
import { RemoveDownloadSheet } from '@/components/podcast/RemoveDownloadSheet';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Tap } from '@/components/ui/Tap';
import { Text } from '@/components/ui/Text';
import type { PodcastEpisode } from '@/integration/podcastFeed';
import {
  runningDownloads,
  sortDownloadRecords,
  totalDownloadedBytes,
  type PodcastVideoDownloadRecord,
  type RunningDownload,
} from '@/integration/podcastVideoDownloads';
import { cn } from '@/lib/cn';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';
import { usePodcastDownloads } from '@/providers/PodcastDownloadsProvider';
import { useEpisodeProgress } from '@/providers/PodcastProgressProvider';

type OpenableEpisode = Pick<PodcastEpisode, 'localizationId' | 'languageCode'>;

function Thumbnail({
  uri,
  durationSeconds,
  dimmed = false,
}: {
  uri: string | undefined;
  durationSeconds: number;
  dimmed?: boolean;
}): ReactElement {
  return (
    <View className="aspect-video w-24 overflow-hidden rounded-tile bg-surface-elevated">
      {uri === undefined ? null : (
        <Image
          accessible={false}
          source={{ uri }}
          resizeMode="cover"
          className={cn(
            'absolute inset-0 h-full w-full',
            dimmed && 'opacity-50',
          )}
        />
      )}
      <View className="absolute bottom-1 right-1 rounded-subtle bg-scrim px-1.5 py-0.5">
        <Text variant="overline">{formatPodcastClock(durationSeconds)}</Text>
      </View>
    </View>
  );
}

function DownloadedRow({
  record,
  thumbnailUri,
  listened,
  first,
  onOpen,
  onRemove,
}: {
  record: PodcastVideoDownloadRecord;
  thumbnailUri: string;
  listened: boolean;
  first: boolean;
  onOpen: () => void;
  onRemove: () => void;
}): ReactElement {
  const { languageCode, t } = useContentLanguage();
  const meta = [
    formatPodcastEpisodeDate(record.createdAt, 'short', languageCode),
    formatDownloadSize(record.byteSize),
  ]
    .filter((part) => part !== '')
    .join(' · ');

  return (
    <View
      className={cn(
        'flex-row items-center gap-1 pl-3',
        !first && 'border-t border-line',
      )}
    >
      <Tap
        accessibilityRole="button"
        accessibilityLabel={t('podcast.openEpisode', { title: record.title })}
        onPress={onOpen}
        className="min-w-0 flex-1 flex-row items-center gap-3 py-3"
      >
        <Thumbnail
          uri={thumbnailUri}
          durationSeconds={record.durationSeconds}
        />
        <View className="min-w-0 flex-1">
          <Text variant="subheading" numberOfLines={3}>
            {record.title}
          </Text>
          <Text variant="caption" tone="muted" className="mt-1">
            {meta}
          </Text>
          {listened ? (
            <View className="mt-1 flex-row items-center gap-1">
              <Icon icon={Check} size="xs" tone="success" />
              <Text variant="caption" tone="success">
                {t('podcast.completedEpisode')}
              </Text>
            </View>
          ) : null}
        </View>
      </Tap>
      <IconButton
        icon={Trash2}
        size="sm"
        variant="ghost"
        tone="muted"
        accessibilityLabel={t('podcast.removeDownloadFor', {
          title: record.title,
        })}
        onPress={onRemove}
      />
    </View>
  );
}

function PendingRow({
  download,
  first,
  onCancel,
}: {
  download: RunningDownload;
  first: boolean;
  onCancel: () => void;
}): ReactElement {
  const { t } = useContentLanguage();
  const status = t('podcast.downloadStatusDownloading', {
    percent: download.percent,
  });

  return (
    <View
      className={cn(
        'flex-row items-center gap-1 pl-3',
        !first && 'border-t border-line',
      )}
    >
      <View className="min-w-0 flex-1 flex-row items-center gap-3 py-3">
        <Thumbnail
          uri={download.thumbnailUrl}
          durationSeconds={download.durationSeconds}
          dimmed
        />
        <View className="min-w-0 flex-1">
          <Text variant="subheading" numberOfLines={3}>
            {download.title}
          </Text>
          <ProgressBar
            value={download.percent}
            height={4}
            className="mt-2"
            accessibilityLabel={status}
          />
          <Text variant="caption" tone="accent" className="mt-1.5">
            {status}
          </Text>
        </View>
      </View>
      <IconButton
        icon={X}
        size="sm"
        variant="ghost"
        tone="muted"
        accessibilityLabel={t('podcast.cancelDownloadFor', {
          title: download.title,
        })}
        onPress={onCancel}
      />
    </View>
  );
}

function EmptyDownloads(): ReactElement {
  const { t } = useContentLanguage();

  return (
    <View className="flex-row items-center gap-2 py-2">
      <Icon icon={Download} size="sm" tone="muted" />
      <Text variant="body-sm" tone="secondary" className="min-w-0 flex-1">
        {t('podcast.downloadsEmptyMessage')}
      </Text>
    </View>
  );
}

/**
 * The podcast screen's offline shelf: running downloads first, then everything
 * saved on this device. Both come from the downloads provider alone, so the
 * shelf stays complete with no feed and no connection.
 */
export function DownloadedEpisodesSection({
  direction,
  onOpenEpisode,
}: {
  direction: EpisodeSortDirection;
  onOpenEpisode: (episode: OpenableEpisode) => void;
}): ReactElement | null {
  const { t } = useContentLanguage();
  const downloads = usePodcastDownloads();
  const { progress } = useEpisodeProgress();
  const [removal, setRemoval] = useState<{
    record: PodcastVideoDownloadRecord | null;
    open: boolean;
  }>({ record: null, open: false });
  const records = useMemo(
    () => sortDownloadRecords(downloads.records, direction),
    [downloads.records, direction],
  );
  const running = useMemo(
    () => runningDownloads(downloads.states),
    [downloads.states],
  );
  if (!downloads.isSupported || !downloads.isHydrated) return null;

  const closeRemoval = () =>
    setRemoval((current) => ({ ...current, open: false }));

  return (
    <ExpandableSection
      title={t('podcast.downloads')}
      count={records.length}
      defaultExpanded
      trailing={
        records.length === 0 ? undefined : (
          <Text variant="caption" tone="muted" numeric>
            {formatDownloadSize(totalDownloadedBytes(records))}
          </Text>
        )
      }
    >
      {records.length === 0 && running.length === 0 ? (
        <EmptyDownloads />
      ) : (
        <>
          <Card>
            {running.map((download, index) => (
              <PendingRow
                key={download.localizationId}
                download={download}
                first={index === 0}
                onCancel={() => downloads.cancel(download.localizationId)}
              />
            ))}
            {records.map((record, index) => (
              <DownloadedRow
                key={record.localizationId}
                record={record}
                thumbnailUri={downloads.localUri(record.thumbnailFileName)}
                listened={progress[record.localizationId]?.listened ?? false}
                first={running.length === 0 && index === 0}
                onOpen={() => onOpenEpisode(record)}
                onRemove={() => setRemoval({ record, open: true })}
              />
            ))}
          </Card>
          <View className="mt-3 flex-row items-start gap-2 px-1">
            <Icon icon={Info} size="xs" tone="muted" />
            <Text variant="caption" tone="muted" className="min-w-0 flex-1">
              {t('podcast.downloadsScope')}
            </Text>
          </View>
        </>
      )}
      <RemoveDownloadSheet
        visible={removal.open}
        byteSize={removal.record?.byteSize ?? 0}
        onClose={closeRemoval}
        onConfirm={() => {
          closeRemoval();
          if (removal.record !== null)
            void downloads.remove(removal.record.localizationId);
        }}
      />
    </ExpandableSection>
  );
}
