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

/** What the shelf shows for a transfer that has no manifest record yet. */
export interface RunningDownloadInfo {
  title: string;
  thumbnailUrl: string;
  durationSeconds: number;
}

export type PodcastDownloadState =
  | { status: 'idle' | 'downloaded' }
  | ({ status: 'downloading'; progress: number } & RunningDownloadInfo)
  | { status: 'failed'; message: string };

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

export function sortDownloadRecords(
  records: readonly PodcastVideoDownloadRecord[],
  sortDirection: 'newest' | 'oldest',
): PodcastVideoDownloadRecord[] {
  return [...records].sort(
    (a, b) =>
      (sortDirection === 'newest' ? -1 : 1) *
      (a.createdAt.localeCompare(b.createdAt) ||
        a.localizationId.localeCompare(b.localizationId)),
  );
}

export function downloadedEpisodeRows(
  records: readonly PodcastVideoDownloadRecord[],
  sortDirection: 'newest' | 'oldest',
): PodcastEpisode[] {
  return sortDownloadRecords(records, sortDirection).map((record) => ({
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

/** Whole percent (0-100) of a 0-1 transfer fraction; anything unusable is 0. */
function toDownloadPercent(progress: number): number {
  if (!Number.isFinite(progress)) return 0;
  return Math.min(100, Math.max(0, Math.floor(progress * 100)));
}

export type EpisodeDownloadPhase =
  | 'unsupported'
  | 'unavailable'
  | 'idle'
  | 'downloading'
  | 'downloaded'
  | 'failed';

export interface EpisodeDownloadView {
  phase: EpisodeDownloadPhase;
  /** Whole percent; 0 unless the phase is `downloading`. */
  percent: number;
  /**
   * The provider's failure text. Set for `failed`, and for `downloaded` when a
   * later removal failed and the video is therefore still on the device.
   */
  message: string | null;
  /** Bytes the saved files occupy; null unless the phase is `downloaded`. */
  byteSize: number | null;
}

/**
 * Collapses the provider's per-episode facts into the one phase the UI shows.
 * Order matters: a platform that cannot download outranks everything, and an
 * episode without a video is only "unavailable" while nothing is saved for it.
 */
export function describeEpisodeDownload({
  isSupported,
  hasVideo,
  record,
  state,
}: {
  isSupported: boolean;
  hasVideo: boolean;
  record: PodcastVideoDownloadRecord | undefined;
  state: PodcastDownloadState | undefined;
}): EpisodeDownloadView {
  const view = (
    phase: EpisodeDownloadPhase,
    detail: Partial<Omit<EpisodeDownloadView, 'phase'>> = {},
  ): EpisodeDownloadView => ({
    phase,
    percent: 0,
    message: null,
    byteSize: null,
    ...detail,
  });
  if (!isSupported) return view('unsupported');
  if (!hasVideo && record === undefined) return view('unavailable');
  if (state?.status === 'downloading')
    return view('downloading', { percent: toDownloadPercent(state.progress) });
  const failure = state?.status === 'failed' ? state.message : null;
  if (record !== undefined)
    return view('downloaded', { byteSize: record.byteSize, message: failure });
  if (failure !== null) return view('failed', { message: failure });
  return view('idle');
}

export interface RunningDownload extends RunningDownloadInfo {
  localizationId: string;
  /** Whole percent, 0-100. */
  percent: number;
}

/** Every transfer in flight, in the order they were started. */
export function runningDownloads(
  states: Readonly<Record<string, PodcastDownloadState>>,
): RunningDownload[] {
  return Object.entries(states).flatMap(([localizationId, state]) =>
    state.status === 'downloading'
      ? [
          {
            localizationId,
            title: state.title,
            thumbnailUrl: state.thumbnailUrl,
            durationSeconds: state.durationSeconds,
            percent: toDownloadPercent(state.progress),
          },
        ]
      : [],
  );
}
