import type { PodcastEpisode } from '@/integration/podcastFeed';
import {
  describeEpisodeDownload,
  type EpisodeDownloadView,
} from '@/integration/podcastVideoDownloads';
import {
  usePodcastDownloads,
  type DownloadsContextValue,
} from '@/providers/PodcastDownloadsProvider';

/** One episode's slice of the offline-downloads provider, reduced to a phase. */
export function useEpisodeDownload(episode: PodcastEpisode): {
  downloads: DownloadsContextValue;
  view: EpisodeDownloadView;
} {
  const downloads = usePodcastDownloads();
  const record = downloads.records.find(
    (item) => item.localizationId === episode.localizationId,
  );
  const view = describeEpisodeDownload({
    isSupported: downloads.isSupported,
    hasVideo: episode.video !== null,
    record,
    state: downloads.states[episode.localizationId],
  });
  return { downloads, view };
}
