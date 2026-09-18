import {
  videoDownloadFileNames,
  type PodcastVideoDownloadRecord,
} from '@/integration/podcastVideoDownloads';
import { createPodcastEpisode } from './podcastEpisode';

export const downloadableEpisode = createPodcastEpisode({
  video: {
    url: 'https://example.com/video.mp4',
    thumbnailUrl: 'https://example.com/thumbnail.jpg',
    durationSeconds: 60,
  },
});
export function downloadRecord(
  overrides: Partial<PodcastVideoDownloadRecord> = {},
): PodcastVideoDownloadRecord {
  const localizationId =
    overrides.localizationId ?? downloadableEpisode.localizationId;
  const names = videoDownloadFileNames(localizationId);
  return {
    localizationId,
    episodeId: downloadableEpisode.id,
    title: downloadableEpisode.title,
    languageCode: downloadableEpisode.languageCode,
    createdAt: downloadableEpisode.createdAt,
    durationSeconds: 60,
    videoFileName: names.video,
    thumbnailFileName: names.thumbnail,
    byteSize: 200,
    downloadedAt: '2026-09-17T00:00:00.000Z',
    ...overrides,
  };
}
