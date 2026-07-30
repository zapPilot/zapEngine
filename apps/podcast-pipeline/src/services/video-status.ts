import {
  type EpisodeLocalizationRow,
  type EpisodeVideoResponse,
  type LanguageClassroomLanguageCode,
  SUPPORTED_PRIMARY_LANGUAGE_CODES,
} from '../types.js';
import { listEpisodeLocalizationsByEpisodeId } from './db.js';
import { orderedPrimaryLocalizations } from './primary-localizations.js';
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
  previousError: string | null;
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
    previousError: string | null;
    updatedAt: string;
  } | null;
  items: EpisodeVideoGenerationItem[];
}

/**
 * Errors that a re-submission's self-healing enqueue wiped from the job rows.
 * Without this, retrying a failed episode clears last_error before the caller
 * ever sees why it failed.
 */
export interface EpisodeVideoGenerationPreviousErrors {
  visual: string | null;
  videosByLocalizationId: Record<string, string | null>;
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
  previousErrors?: EpisodeVideoGenerationPreviousErrors;
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
        previousError:
          input.previousErrors?.videosByLocalizationId[localizationId] ?? null,
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
          previousError: input.previousErrors?.visual ?? null,
          updatedAt: input.visualJob.updated_at,
        }
      : null,
    items,
  };
}

export async function buildEpisodeVideoGenerationForLocalizations(
  episodeId: string,
  localizations: readonly EpisodeLocalizationRow[],
  options: {
    error?: Error | null;
    previousErrors?: EpisodeVideoGenerationPreviousErrors;
  } = {},
): Promise<EpisodeVideoGenerationResponse> {
  const visualRepository = getVideoVisualJobRepository();
  const videoRepository = getVideoJobRepository();
  const [visualJob, jobs] = await Promise.all([
    visualRepository.find(episodeId),
    Promise.all(
      orderedPrimaryLocalizations(localizations).flatMap(
        ({ languageCode, localization }) => {
          return localization
            ? [
                (async (): Promise<EpisodeVideoJobWithLanguage> => ({
                  languageCode,
                  localizationId: localization.id,
                  job: await videoRepository.find(localization.id),
                }))(),
              ]
            : [];
        },
      ),
    ),
  ]);

  return buildEpisodeVideoGenerationResponse({
    episodeId,
    jobs,
    visualJob,
    error: options.error,
    previousErrors: options.previousErrors,
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

  return buildEpisodeVideoGenerationForLocalizations(episodeId, localizations);
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
