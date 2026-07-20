import { randomUUID } from 'node:crypto';

import {
  DEFAULT_LANGUAGE_CODE,
  type LanguageClassroomLanguageCode,
} from '../types.js';
import { findEpisodeLocalizationByEpisodeId } from './db.js';
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
  type EpisodeVideoJobRow,
} from './video-jobs.js';

export interface PostIngestResult {
  ingest: IngestResult;
  /** Null when audio finished but scheduling the video job failed. */
  videoJob: EpisodeVideoJobRow | null;
  videoEnqueueError: Error | null;
}

interface PostIngestDependencies {
  coordinator: HeavyWorkCoordinator;
  performIngest: typeof performMultilingualIngest;
  findCanonicalLocalization: typeof findEpisodeLocalizationByEpisodeId;
  enqueueVideo: typeof enqueueEpisodeVideoJob;
}

const defaultDependencies: PostIngestDependencies = {
  coordinator: heavyWorkCoordinator,
  performIngest: performMultilingualIngest,
  findCanonicalLocalization: findEpisodeLocalizationByEpisodeId,
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
          logIngestEvent('video:canonical-localization:start', {
            episodeId: ingest.episode.id,
          });
          const canonicalLocalization =
            await dependencies.findCanonicalLocalization(
              ingest.episode.id,
              DEFAULT_LANGUAGE_CODE,
            );
          logIngestEvent('video:canonical-localization:done', {
            elapsedMs: Date.now() - lookupStartedAt,
            episodeId: ingest.episode.id,
          });
          if (
            canonicalLocalization?.status !== 'completed' ||
            !canonicalLocalization.hls_url.trim() ||
            !canonicalLocalization.classroom_hls_url?.trim()
          ) {
            throw new Error(
              'Completed canonical localization is required to enqueue video and must include main and classroom audio',
            );
          }

          const telegramChatId =
            typeof options.telegramChatId === 'function'
              ? options.telegramChatId()
              : options.telegramChatId;
          logIngestEvent('video:enqueue:start', {
            episodeId: ingest.episode.id,
          });
          const enqueueStartedAt = Date.now();
          const videoJob = await dependencies.enqueueVideo(
            canonicalLocalization.id,
            telegramChatId === undefined ? null : String(telegramChatId),
          );
          logIngestEvent('video:enqueue:done', {
            elapsedMs: Date.now() - enqueueStartedAt,
            episodeId: ingest.episode.id,
            status: videoJob.status,
          });
          return { ingest, videoJob, videoEnqueueError: null };
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
          return { ingest, videoJob: null, videoEnqueueError };
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
