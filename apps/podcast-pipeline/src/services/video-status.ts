import {
  type EpisodeVideoResponse,
  type LanguageClassroomLanguageCode,
  SUPPORTED_PRIMARY_LANGUAGE_CODES,
} from '../types.js';
import { listEpisodeLocalizationsByEpisodeId } from './db.js';
import {
  type EpisodeVideoJobRow,
  type EpisodeVideoJobStatus,
  type EpisodeVideoVisualJobRow,
  getVideoJobRepository,
  getVideoVisualJobRepository,
} from './video-jobs.js';

export type EpisodeVideoGenerationStatus =
  | EpisodeVideoJobStatus
  | 'unavailable';

export interface EpisodeVideoGenerationItem {
  languageCode: LanguageClassroomLanguageCode;
  localizationId: string;
  status: EpisodeVideoGenerationStatus;
  url: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  lastError: string | null;
  updatedAt: string | null;
  episodeEndpoint: string;
}

export interface EpisodeVideoGenerationResponse {
  episodeId: string;
  status: EpisodeVideoGenerationStatus;
  statusEndpoint: string;
  error: string | null;
  visual: {
    status: EpisodeVideoJobStatus;
    lastError: string | null;
    updatedAt: string;
  } | null;
  items: EpisodeVideoGenerationItem[];
}

export interface EpisodeVideoJobWithLanguage {
  languageCode: LanguageClassroomLanguageCode;
  localizationId: string;
  job: EpisodeVideoJobRow | null;
}

export function buildEpisodeVideoGenerationResponse(input: {
  episodeId: string;
  jobs: readonly EpisodeVideoJobWithLanguage[];
  visualJob: EpisodeVideoVisualJobRow | null;
  error?: Error | null;
}): EpisodeVideoGenerationResponse {
  const items: EpisodeVideoGenerationItem[] = input.jobs.map(
    ({ languageCode, localizationId, job }) => {
      const video = completedVideoResponse(job);
      const status: EpisodeVideoGenerationStatus = job?.status ?? 'unavailable';
      return {
        languageCode,
        localizationId,
        status,
        url: video?.url ?? null,
        thumbnailUrl: video?.thumbnailUrl ?? null,
        durationSeconds: video?.durationSeconds ?? null,
        lastError: job?.last_error ?? null,
        updatedAt: job?.updated_at ?? null,
        episodeEndpoint: `/episodes/${localizationId}`,
      };
    },
  );

  return {
    episodeId: input.episodeId,
    status: aggregateVideoGenerationStatus(
      items.map((item) => item.status),
      input.visualJob?.status ?? null,
    ),
    statusEndpoint: `/episodes/${input.episodeId}/videos`,
    error: input.error?.message ?? null,
    visual: input.visualJob
      ? {
          status: input.visualJob.status,
          lastError: input.visualJob.last_error,
          updatedAt: input.visualJob.updated_at,
        }
      : null,
    items,
  };
}

export function buildEpisodeVideoGenerationFromEnqueue(input: {
  episodeId: string;
  videoJobs: readonly EpisodeVideoJobRow[];
  visualJob: EpisodeVideoVisualJobRow | null;
  error?: Error | null;
}): EpisodeVideoGenerationResponse {
  const orderedJobs: EpisodeVideoJobWithLanguage[] = input.videoJobs.flatMap(
    (job, index) => {
      const languageCode = SUPPORTED_PRIMARY_LANGUAGE_CODES[index];
      return languageCode
        ? [
            {
              languageCode,
              localizationId: job.episode_localization_id,
              job,
            },
          ]
        : [];
    },
  );

  return buildEpisodeVideoGenerationResponse({
    episodeId: input.episodeId,
    jobs: orderedJobs,
    visualJob: input.visualJob,
    error: input.error,
  });
}

export async function loadEpisodeVideoGeneration(
  episodeId: string,
): Promise<EpisodeVideoGenerationResponse | null> {
  const localizations = await listEpisodeLocalizationsByEpisodeId(
    episodeId,
    SUPPORTED_PRIMARY_LANGUAGE_CODES,
  );
  if (localizations.length === 0) return null;

  const visualRepository = getVideoVisualJobRepository();
  const videoRepository = getVideoJobRepository();
  const [visualJob, jobs] = await Promise.all([
    visualRepository.find(episodeId),
    Promise.all(
      SUPPORTED_PRIMARY_LANGUAGE_CODES.flatMap((languageCode) => {
        const localization = localizations.find(
          (candidate) => candidate.language_code === languageCode,
        );
        return localization
          ? [
              (async (): Promise<EpisodeVideoJobWithLanguage> => ({
                languageCode,
                localizationId: localization.id,
                job: await videoRepository.find(localization.id),
              }))(),
            ]
          : [];
      }),
    ),
  ]);

  return buildEpisodeVideoGenerationResponse({
    episodeId,
    jobs,
    visualJob,
  });
}

export function completedVideoResponse(
  job: EpisodeVideoJobRow | null | undefined,
): EpisodeVideoResponse | null {
  if (job?.status !== 'completed') return null;
  const url = job.mp4_url?.trim();
  const thumbnailUrl = job.thumbnail_url?.trim();
  const durationSeconds = job.duration_seconds;
  if (
    !url ||
    !thumbnailUrl ||
    typeof durationSeconds !== 'number' ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds <= 0
  ) {
    return null;
  }
  return { url, thumbnailUrl, durationSeconds };
}

function aggregateVideoGenerationStatus(
  videoStatuses: readonly EpisodeVideoGenerationStatus[],
  visualStatus: EpisodeVideoJobStatus | null,
): EpisodeVideoGenerationStatus {
  const statuses = [visualStatus, ...videoStatuses].filter(
    (status): status is EpisodeVideoGenerationStatus => status !== null,
  );
  if (statuses.includes('failed')) return 'failed';
  if (
    videoStatuses.length > 0 &&
    videoStatuses.every((status) => status === 'completed')
  ) {
    return 'completed';
  }
  if (statuses.includes('processing')) return 'processing';
  if (statuses.includes('queued')) return 'queued';
  return 'unavailable';
}
