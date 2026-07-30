import { randomUUID } from 'node:crypto';

import {
  DEFAULT_LANGUAGE_CODE,
  type EpisodeLocalizationRow,
  type LanguageClassroomLanguageCode,
  SUPPORTED_PRIMARY_LANGUAGE_CODES,
} from '../types.js';
import {
  findEpisodeBySourceUrl,
  listEpisodeLocalizationsByEpisodeId,
} from './db.js';
import {
  type HeavyWorkCoordinator,
  heavyWorkCoordinator,
} from './heavy-work.js';
import { type IngestResult, performMultilingualIngest } from './ingest.js';
import {
  getStepLogContext,
  logIngestEvent,
  withStepLogContext,
} from './ingest/step.js';
import { orderedPrimaryLocalizations } from './primary-localizations.js';
import type { TelegramChatId } from './telegram.js';
import {
  enqueueEpisodeVideoJob,
  enqueueEpisodeVideoVisualJob,
  EPISODE_VIDEO_VISUAL_VERSION,
  type EpisodeVideoJobRow,
  type EpisodeVideoVisualJobRow,
  findEpisodeVideoJob,
  findEpisodeVideoVisualJob,
  hashEpisodeVideoVisualSource,
} from './video-jobs.js';
import type { EpisodeVideoGenerationPreviousErrors } from './video-status.js';

export interface PostIngestResult {
  ingest: IngestResult;
  runId: string;
  /** Null when audio finished but scheduling the video job failed. */
  videoJob: EpisodeVideoJobRow | null;
  videoJobs: EpisodeVideoJobRow[];
  visualJob: EpisodeVideoVisualJobRow | null;
  videoEnqueueError: Error | null;
  previousErrors: EpisodeVideoGenerationPreviousErrors;
}

interface PostIngestDependencies {
  coordinator: HeavyWorkCoordinator;
  performIngest: typeof performMultilingualIngest;
  findEpisode: typeof findEpisodeBySourceUrl;
  listLocalizations: typeof listEpisodeLocalizationsByEpisodeId;
  enqueueVisual: typeof enqueueEpisodeVideoVisualJob;
  enqueueVideo: typeof enqueueEpisodeVideoJob;
  findVisualJob: typeof findEpisodeVideoVisualJob;
  findVideoJob: typeof findEpisodeVideoJob;
}

const defaultDependencies: PostIngestDependencies = {
  coordinator: heavyWorkCoordinator,
  performIngest: performMultilingualIngest,
  findEpisode: findEpisodeBySourceUrl,
  listLocalizations: listEpisodeLocalizationsByEpisodeId,
  enqueueVisual: enqueueEpisodeVideoVisualJob,
  enqueueVideo: enqueueEpisodeVideoJob,
  findVisualJob: findEpisodeVideoVisualJob,
  findVideoJob: findEpisodeVideoJob,
};

const EMPTY_PREVIOUS_ERRORS: EpisodeVideoGenerationPreviousErrors = {
  visual: null,
  videosByLocalizationId: {},
};

/**
 * The enqueue RPCs self-heal failed/stale rows by resetting them, which also
 * clears last_error. Surface an error only when this enqueue actually wiped
 * it; errors still present on the row stay in the regular lastError field.
 */
function erasedByReset(
  previous: string | null | undefined,
  current: string | null,
): string | null {
  return previous != null && current == null ? previous : null;
}

export async function performMultilingualIngestAndEnqueueVideo(
  url: string,
  responseLanguageCode: LanguageClassroomLanguageCode,
  options: {
    telegramChatId?: TelegramChatId | (() => TelegramChatId | undefined);
    signal?: AbortSignal;
    dependencies?: Partial<PostIngestDependencies>;
  } = {},
): Promise<PostIngestResult> {
  const dependencies = { ...defaultDependencies, ...options.dependencies };
  const runId = getStepLogContext()?.runId ?? randomUUID().slice(0, 8);
  return withStepLogContext({ runId }, async () => {
    const startedAt = Date.now();
    logIngestEvent('run:start', {
      responseLanguage: responseLanguageCode,
      url,
    });

    try {
      const runBody = async (): Promise<PostIngestResult> => {
        const ingest = await dependencies.performIngest(
          url,
          responseLanguageCode,
        );

        // Audio is committed at this point. Scheduling the video job must never turn
        // a successful ingest into a failure — a video enqueue error is reported
        // separately, and the audio result is still returned to the caller.
        try {
          const lookupStartedAt = Date.now();
          logIngestEvent('video:localizations:start', {
            episodeId: ingest.episode.id,
          });
          const localizations = await dependencies.listLocalizations(
            ingest.episode.id,
            SUPPORTED_PRIMARY_LANGUAGE_CODES,
          );
          logIngestEvent('video:localizations:done', {
            elapsedMs: Date.now() - lookupStartedAt,
            episodeId: ingest.episode.id,
          });

          const renderableLocalizations =
            requireVideoLocalizations(localizations);

          const canonicalLocalization = renderableLocalizations[0]!;
          const englishLocalization = renderableLocalizations.find(
            (localization) => localization.language_code === 'en',
          )!;
          const telegramChatId =
            typeof options.telegramChatId === 'function'
              ? options.telegramChatId()
              : options.telegramChatId;
          const normalizedTelegramChatId =
            telegramChatId === undefined ? null : String(telegramChatId);
          logIngestEvent('video:enqueue:start', {
            episodeId: ingest.episode.id,
          });
          const enqueueStartedAt = Date.now();
          const priorVisualJob = await dependencies.findVisualJob(
            ingest.episode.id,
          );
          const priorVideoJobs = new Map<string, EpisodeVideoJobRow | null>();
          for (const localization of renderableLocalizations) {
            priorVideoJobs.set(
              localization.id,
              await dependencies.findVideoJob(localization.id),
            );
          }
          const visualJob = await dependencies.enqueueVisual(
            ingest.episode.id,
            {
              visualVersion: EPISODE_VIDEO_VISUAL_VERSION,
              sourceHash: hashEpisodeVideoVisualSource(
                canonicalLocalization.script!,
                englishLocalization.script!,
              ),
              telegramChatId: normalizedTelegramChatId,
            },
          );
          const videoJobs: EpisodeVideoJobRow[] = [];
          for (const [
            index,
            localization,
          ] of renderableLocalizations.entries()) {
            videoJobs.push(
              await dependencies.enqueueVideo(
                localization.id,
                index === 0 ? normalizedTelegramChatId : null,
              ),
            );
          }
          const videoJob = videoJobs[0] ?? null;
          logIngestEvent('video:enqueue:done', {
            elapsedMs: Date.now() - enqueueStartedAt,
            episodeId: ingest.episode.id,
            status: videoJob?.status ?? 'unavailable',
          });
          return {
            ingest,
            runId,
            videoJob,
            videoJobs,
            visualJob,
            videoEnqueueError: null,
            previousErrors: {
              visual: erasedByReset(
                priorVisualJob?.last_error,
                visualJob.last_error,
              ),
              videosByLocalizationId: Object.fromEntries(
                videoJobs.map((job) => [
                  job.episode_localization_id,
                  erasedByReset(
                    priorVideoJobs.get(job.episode_localization_id)?.last_error,
                    job.last_error,
                  ),
                ]),
              ),
            },
          };
        } catch (error) {
          const videoEnqueueError =
            error instanceof Error ? error : new Error(String(error));
          console.error(
            '[post-ingest] video enqueue failed; audio remains available',
            {
              episodeId: ingest.episode.id,
              error: videoEnqueueError.message,
            },
          );
          logIngestEvent('video:enqueue:failed', {
            episodeId: ingest.episode.id,
            error: videoEnqueueError.message,
          });
          return {
            ingest,
            runId,
            videoJob: null,
            videoJobs: [],
            visualJob: null,
            videoEnqueueError,
            previousErrors: EMPTY_PREVIOUS_ERRORS,
          };
        }
      };

      // A fully-ingested episode needs no scrape/LLM/TTS work — only cheap DB
      // reads and idempotent enqueue RPCs — so it skips the heavy-work queue.
      // This keeps "re-POST the same URL" usable as a progress query even
      // while a multi-minute video render is holding the coordinator.
      let result: PostIngestResult;
      if (await isFullyIngested(url, dependencies)) {
        logIngestEvent('queue:bypass', { reason: 'episode-fully-ingested' });
        result = await runBody();
      } else {
        logIngestEvent('queue:waiting');
        result = await dependencies.coordinator.runIngest(async () => {
          logIngestEvent('queue:acquired');
          return runBody();
        }, options.signal);
      }

      logIngestEvent('run:done', {
        elapsedMs: Date.now() - startedAt,
        episodeId: result.ingest.episode.id,
        status: result.ingest.statusCode,
      });
      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logIngestEvent('run:failed', {
        elapsedMs: Date.now() - startedAt,
        error: err.message,
      });
      throw error;
    }
  });
}

/**
 * True when every supported localization is completed with renderable audio,
 * i.e. a resubmission would skip every heavy stage. The check is a snapshot:
 * a rare mid-flight repair (e.g. a corrupted translation) can still run
 * outside the coordinator, which risks CPU contention with a render but no
 * correctness issue — every stage checkpoints to the database.
 */
async function isFullyIngested(
  url: string,
  dependencies: PostIngestDependencies,
): Promise<boolean> {
  const episode = await dependencies.findEpisode(url);
  if (!episode) return false;
  const localizations = await dependencies.listLocalizations(
    episode.id,
    SUPPORTED_PRIMARY_LANGUAGE_CODES,
  );
  try {
    requireVideoLocalizations(localizations);
    return true;
  } catch {
    return false;
  }
}

function requireVideoLocalizations(
  localizations: readonly EpisodeLocalizationRow[],
): EpisodeLocalizationRow[] {
  return orderedPrimaryLocalizations(localizations).map(
    ({ languageCode, localization }) => {
      const audioReady =
        Boolean(localization?.hls_url.trim()) &&
        (languageCode !== DEFAULT_LANGUAGE_CODE ||
          Boolean(localization?.classroom_hls_url?.trim()));
      if (
        localization?.status !== 'completed' ||
        !localization.script?.trim() ||
        !audioReady
      ) {
        throw new Error(
          `Completed ${languageCode} localization with eligible audio is required to enqueue video`,
        );
      }
      return localization;
    },
  );
}
