import type { PodcastEpisode, PodcastEpisodeVideo } from './podcastFeed';

export interface PodcastVideoDownloadRecord {
  localizationId: string;
  episodeId: string;
  title: string;
  languageCode: string;
  createdAt: string;
  durationSeconds: number;
  videoFileName: string;
  thumbnailFileName: string;
  byteSize: number;
  downloadedAt: string;
}

export const PODCAST_VIDEO_DOWNLOADS_STORAGE_KEY = 'podcast_video_downloads';

export function videoDownloadFileNames(localizationId: string) {
  const stem = `episode-${encodeURIComponent(localizationId).replace(/_/g, '%5F').replace(/%/g, '_')}`;
  return { video: `${stem}.mp4`, thumbnail: `${stem}.jpg` };
}

function isDownloadRecord(value: unknown): value is PodcastVideoDownloadRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    return false;
  const record = value as Record<string, unknown>;
  for (const key of [
    'localizationId',
    'episodeId',
    'title',
    'languageCode',
    'createdAt',
    'downloadedAt',
  ]) {
    if (typeof record[key] !== 'string' || record[key].trim() === '')
      return false;
  }
  for (const key of ['durationSeconds', 'byteSize']) {
    if (
      typeof record[key] !== 'number' ||
      !Number.isFinite(record[key]) ||
      record[key] <= 0
    )
      return false;
  }
  if (!Number.isSafeInteger(record['byteSize'])) return false;
  if (
    !Number.isFinite(Date.parse(record['createdAt'] as string)) ||
    !Number.isFinite(Date.parse(record['downloadedAt'] as string))
  )
    return false;
  try {
    const names = videoDownloadFileNames(record['localizationId'] as string);
    return (
      record['videoFileName'] === names.video &&
      record['thumbnailFileName'] === names.thumbnail
    );
  } catch {
    return false;
  }
}

export function parseStoredVideoDownloads(
  raw: string | null,
): PodcastVideoDownloadRecord[] {
  try {
    const parsed: unknown = JSON.parse(raw ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isDownloadRecord).reduce(mergeDownloadRecord, []);
  } catch {
    return [];
  }
}

export function mergeDownloadRecord(
  records: readonly PodcastVideoDownloadRecord[],
  record: PodcastVideoDownloadRecord,
): PodcastVideoDownloadRecord[] {
  return [...removeDownloadRecord(records, record.localizationId), record];
}

export function removeDownloadRecord(
  records: readonly PodcastVideoDownloadRecord[],
  localizationId: string,
): PodcastVideoDownloadRecord[] {
  return records.filter((record) => record.localizationId !== localizationId);
}

export function totalDownloadedBytes(
  records: readonly PodcastVideoDownloadRecord[],
): number {
  return records.reduce((total, record) => total + record.byteSize, 0);
}

export function resolveOfflineEpisodeVideo(
  video: PodcastEpisodeVideo | null,
  record: PodcastVideoDownloadRecord | undefined,
  toLocalUri: (fileName: string) => string,
): PodcastEpisodeVideo | null {
  return record === undefined
    ? video
    : {
        url: toLocalUri(record.videoFileName),
        thumbnailUrl: toLocalUri(record.thumbnailFileName),
        durationSeconds: record.durationSeconds,
      };
}

export function downloadedEpisodeRows(
  records: readonly PodcastVideoDownloadRecord[],
  sortDirection: 'newest' | 'oldest',
): PodcastEpisode[] {
  return [...records]
    .sort(
      (a, b) =>
        (sortDirection === 'newest' ? -1 : 1) *
        (a.createdAt.localeCompare(b.createdAt) ||
          a.localizationId.localeCompare(b.localizationId)),
    )
    .map((record) => ({
      id: record.episodeId,
      localizationId: record.localizationId,
      title: record.title,
      languageCode: record.languageCode,
      createdAt: record.createdAt,
      hlsUrl: '',
      listened: false,
      likeCount: 0,
      script: null,
      video: {
        url: record.videoFileName,
        thumbnailUrl: record.thumbnailFileName,
        durationSeconds: record.durationSeconds,
      },
      videoGeneration: null,
      audioTracks: [],
      languageClassrooms: [],
      lastPositionSeconds: 0,
    }));
}
