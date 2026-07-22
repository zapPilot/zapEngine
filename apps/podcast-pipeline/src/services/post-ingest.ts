import { randomUUID } from 'node:crypto';

import {
  DEFAULT_LANGUAGE_CODE,
  type EpisodeLocalizationRow,
  type LanguageClassroomLanguageCode,
  SUPPORTED_PRIMARY_LANGUAGE_CODES,
} from '../types.js';
import { listEpisodeLocalizationsByEpisodeId } from './db.js';
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
import type { TelegramChatId } from './telegram.js';
import {
  enqueueEpisodeVideoJob,
  enqueueEpisodeVideoVisualJob,
  EPISODE_VIDEO_VISUAL_VERSION,
  type EpisodeVideoJobRow,
  type EpisodeVideoVisualJobRow,
  hashEpisodeVideoVisualSource,
} from './video-jobs.js';

export interface PostIngestResult {
  ingest: IngestResult;
  /** Null when audio finished but scheduling the video job failed. */
  videoJob: EpisodeVideoJobRow | null;
  videoJobs: EpisodeVideoJobRow[];
  visualJob: EpisodeVideoVisualJobRow | null;
  videoEnqueueError: Error | null;
}

interface PostIngestDependencies {
  coordinator: HeavyWorkCoordinator;
  performIngest: typeof performMultilingualIngest;
  listLocalizations: typeof listEpisodeLocalizationsByEpisodeId;
  enqueueVisual: typeof enqueueEpisodeVideoVisualJob;
  enqueueVideo: typeof enqueueEpisodeVideoJob;
}

const defaultDependencies: PostIngestDependencies = {
  coordinator: heavyWorkCoordinator,
  performIngest: performMultilingualIngest,
  listLocalizations: listEpisodeLocalizationsByEpisodeId,
  enqueueVisual: enqueueEpisodeVideoVisualJob,
  enqueueVideo: enqueueEpisodeVideoJob,
};

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
    logIngestEvent('queue:waiting');

    try {
      const result = await dependencies.coordinator.runIngest(async () => {
        logIngestEvent('queue:acquired');
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
            videoJob,
            videoJobs,
            visualJob,
            videoEnqueueError: null,
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
            videoJob: null,
            videoJobs: [],
            visualJob: null,
            videoEnqueueError,
          };
        }
      }, options.signal);

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

function requireVideoLocalizations(
  localizations: readonly EpisodeLocalizationRow[],
): EpisodeLocalizationRow[] {
  return SUPPORTED_PRIMARY_LANGUAGE_CODES.map((languageCode) => {
    const localization = localizations.find(
      (candidate) => candidate.language_code === languageCode,
    );
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
  });
}
