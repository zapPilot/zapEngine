import { Download, Trash2, X } from 'lucide-react-native';
import { Text, View } from 'react-native';
import type { PodcastEpisode } from '@/integration/podcastFeed';
import { usePodcastDownloads } from '@/providers/PodcastDownloadsProvider';
import { PodcastIconButton } from './EpisodeMediaPlayer';

export function EpisodeDownloadButton({
  episode,
}: {
  episode: PodcastEpisode;
}) {
  const downloads = usePodcastDownloads();
  const record = downloads.records.find(
    (item) => item.localizationId === episode.localizationId,
  );
  const state = downloads.states[episode.localizationId];
  const downloading = state?.status === 'downloading';
  const unavailable =
    !downloads.isSupported || (episode.video === null && record === undefined);
  const label = !downloads.isSupported
    ? 'Downloads require iOS or Android'
    : unavailable
      ? 'No video to download'
      : downloading
        ? `Cancel download (${Math.floor(state.progress * 100)}%)`
        : record !== undefined
          ? 'Delete downloaded video'
          : state?.status === 'failed'
            ? 'Retry video download'
            : 'Download video';
  const Icon = downloading ? X : record !== undefined ? Trash2 : Download;
  return (
    <View className="items-center">
      <PodcastIconButton
        label={label}
        disabled={unavailable || !downloads.isHydrated}
        onPress={() => {
          if (downloading) downloads.cancel(episode.localizationId);
          else if (record !== undefined)
            void downloads.remove(episode.localizationId);
          else void downloads.download(episode);
        }}
      >
        <Icon size={18} strokeWidth={2} color="#d4c5a3" />
      </PodcastIconButton>
      <Text
        accessibilityLiveRegion="polite"
        className="max-w-[120px] text-center text-[10px] text-ink-dim"
      >
        {unavailable
          ? label
          : downloading
            ? `${Math.floor(state.progress * 100)}%`
            : state?.status === 'failed'
              ? state.message
              : record !== undefined
                ? 'Downloaded'
                : 'Main video only'}
      </Text>
    </View>
  );
}
